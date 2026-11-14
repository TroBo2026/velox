import Foundation
import CoreLocation

/// A plotted point is derived data. Original GPS and barometer observations remain
/// untouched in Ride.points and Ride.barometerSamples.
struct RideElevationProfilePoint: Equatable, Identifiable {
    let id: Int
    let distanceM: Double
    let altitudeM: Double
}

struct RideElevationAnalysis: Equatable {
    enum Reference: String {
        case gpsCalibrated = "GPS-kalibriert"
        case barometerRelative = "Nur relative Barometerhöhe"
        case gpsOnly = "Nur GPS-Höhe"
        case unavailable = "Keine ausreichenden Höhendaten"
    }

    let profile: [RideElevationProfilePoint]
    let ascentM: Double
    let descentM: Double
    let netChangeM: Double
    let reference: Reference
    let gpsAnchorCount: Int
    let calibrationOffsetM: Double?
    let calibrationSpreadM: Double?
    let rawBarometerCount: Int
    let usableGPSAltitudeCount: Int

    var isGPSCalibrated: Bool { reference == .gpsCalibrated }

    init(ride: Ride?) {
        guard let ride else {
            self.init(empty: ())
            return
        }

        let gps = ride.points
            .filter {
                $0.t.isFinite && $0.lat.isFinite && $0.lon.isFinite &&
                $0.accuracy.map { $0 >= 0 && $0 <= 35 } == true
            }
            .sorted { $0.t < $1.t }

        let barometer = (ride.barometerSamples ?? [])
            .filter {
                $0.timestampMs > 0 && $0.pressureKPa.isFinite && $0.pressureKPa > 0 &&
                $0.relativeAltitudeM.isFinite
            }
            .sorted { $0.timestampMs < $1.timestampMs }

        let trustedGPS = gps.filter {
            guard let altitude = $0.alt, let accuracy = $0.altAccuracy else { return false }
            return altitude.isFinite && accuracy.isFinite && accuracy >= 0 && accuracy <= 15
        }

        rawBarometerCount = ride.barometerSamples?.count ?? 0
        usableGPSAltitudeCount = trustedGPS.count

        // Pair each barometer observation with the nearest trusted GPS altitude.
        // GPS fixes are references only; the barometer retains the shape of the profile.
        let offsets: [Double] = barometer.compactMap { sample in
            guard let point = nearestGPS(to: sample.timestampMs, in: trustedGPS, maxDifferenceMs: 10_000),
                  let gpsAltitude = point.alt else { return nil }
            let offset = gpsAltitude - sample.relativeAltitudeM
            return offset.isFinite ? offset : nil
        }

        let sortedOffsets = offsets.sorted()
        let offset = median(sortedOffsets)
        let spread = offset.map { value in
            median(sortedOffsets.map { abs($0 - value) }.sorted())
        }
        let calibrated = sortedOffsets.count >= 3

        let route = makeRoute(gps)
        var plotted: [RideElevationProfilePoint] = []

        if !barometer.isEmpty {
            for sample in barometer {
                guard let distance = distance(at: sample.timestampMs, on: route) else { continue }
                let altitude = sample.relativeAltitudeM + (calibrated ? (offset ?? 0) : 0)
                guard altitude.isFinite else { continue }
                plotted.append(RideElevationProfilePoint(
                    id: plotted.count,
                    distanceM: distance,
                    altitudeM: altitude
                ))
            }
        } else {
            // Explicit GPS-only fallback; never label this as barometer fusion.
            for point in trustedGPS {
                guard let altitude = point.alt, let distance = distance(at: Int64((point.t * 1_000).rounded()), on: route) else { continue }
                plotted.append(RideElevationProfilePoint(
                    id: plotted.count,
                    distanceM: distance,
                    altitudeM: altitude
                ))
            }
        }

        profile = plotted
        if calibrated {
            reference = .gpsCalibrated
            calibrationOffsetM = offset
            calibrationSpreadM = spread
            gpsAnchorCount = sortedOffsets.count
        } else if !barometer.isEmpty {
            reference = .barometerRelative
            calibrationOffsetM = nil
            calibrationSpreadM = nil
            gpsAnchorCount = sortedOffsets.count
        } else if !plotted.isEmpty {
            reference = .gpsOnly
            calibrationOffsetM = nil
            calibrationSpreadM = nil
            gpsAnchorCount = 0
        } else {
            reference = .unavailable
            calibrationOffsetM = nil
            calibrationSpreadM = nil
            gpsAnchorCount = 0
        }

        let totals = Self.elevationTotals(plotted)
        ascentM = totals.ascent
        descentM = totals.descent
        netChangeM = (plotted.last?.altitudeM ?? 0) - (plotted.first?.altitudeM ?? 0)
    }

    private init(empty: Void) {
        profile = []
        ascentM = 0
        descentM = 0
        netChangeM = 0
        reference = .unavailable
        gpsAnchorCount = 0
        calibrationOffsetM = nil
        calibrationSpreadM = nil
        rawBarometerCount = 0
        usableGPSAltitudeCount = 0
    }

    private struct RoutePoint {
        let timestampMs: Int64
        let distanceM: Double
    }

    private static func makeRoute(_ points: [RidePoint]) -> [RoutePoint] {
        var result: [RoutePoint] = []
        var distance = 0.0
        var previous: RidePoint?
        for point in points {
            guard let previousPoint = previous else {
                result.append(RoutePoint(timestampMs: Int64((point.t * 1_000).rounded()), distanceM: distance))
                previous = point
                continue
            }
            let elapsedMs = Int64(((point.t - previousPoint.t) * 1_000).rounded())
            guard elapsedMs > 0 else { continue }
            let a = CLLocation(latitude: previousPoint.lat, longitude: previousPoint.lon)
            let b = CLLocation(latitude: point.lat, longitude: point.lon)
            let segment = b.distance(from: a)
            guard elapsedMs <= 30_000, segment.isFinite, segment >= 0, segment <= 120 else {
                // Start a new valid segment without inventing distance across the gap.
                result.append(RoutePoint(timestampMs: Int64((point.t * 1_000).rounded()), distanceM: distance))
                previous = point
                continue
            }
            distance += segment
            result.append(RoutePoint(timestampMs: Int64((point.t * 1_000).rounded()), distanceM: distance))
            previous = point
        }
        return result
    }

    private func makeRoute(_ points: [RidePoint]) -> [RoutePoint] {
        Self.makeRoute(points)
    }

    private func distance(at timestamp: Int64, on route: [RoutePoint]) -> Double? {
        guard route.count >= 2 else { return nil }
        for index in 1..<route.count {
            let left = route[index - 1]
            let right = route[index]
            let duration = right.timestampMs - left.timestampMs
            guard duration > 0, duration <= 30_000,
                  timestamp >= left.timestampMs, timestamp <= right.timestampMs else { continue }
            let fraction = Double(timestamp - left.timestampMs) / Double(duration)
            return left.distanceM + (right.distanceM - left.distanceM) * fraction
        }
        return nil
    }

    private func nearestGPS(to timestamp: Int64, in points: [RidePoint], maxDifferenceMs: Int64) -> RidePoint? {
        points.min { lhs, rhs in
            abs(Int64((lhs.t * 1_000).rounded()) - timestamp) <
            abs(Int64((rhs.t * 1_000).rounded()) - timestamp)
        }.flatMap { point in
            abs(Int64((point.t * 1_000).rounded()) - timestamp) <= maxDifferenceMs ? point : nil
        }
    }

    private func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let middle = values.count / 2
        if values.count.isMultiple(of: 2) {
            return (values[middle - 1] + values[middle]) / 2
        }
        return values[middle]
    }

    private static func elevationTotals(_ points: [RideElevationProfilePoint]) -> (ascent: Double, descent: Double) {
        guard let first = points.first else { return (0, 0) }
        var ascent = 0.0
        var descent = 0.0
        var previous = first.altitudeM
        for point in points.dropFirst() {
            let delta = point.altitudeM - previous
            // Reject isolated jumps; keep the raw observation in the ride archive.
            if delta.isFinite && abs(delta) <= 8 {
                if delta >= 1 { ascent += delta }
                else if delta <= -1 { descent += abs(delta) }
            }
            previous = point.altitudeM
        }
        return (ascent, descent)
    }
}

/// Compatibility summary for the existing dashboard.
struct RideElevationSummary: Equatable {
    let ascentM: Double
    let descentM: Double
    let netChangeM: Double
    let sampleCount: Int

    init(samples: [BarometerSample]) {
        let ordered = samples
            .filter { $0.timestampMs > 0 && $0.relativeAltitudeM.isFinite }
            .sorted { $0.timestampMs < $1.timestampMs }
        sampleCount = ordered.count
        guard let first = ordered.first else {
            ascentM = 0
            descentM = 0
            netChangeM = 0
            return
        }
        let totals = RideElevationAnalysis.elevationTotalsForSummary(ordered)
        ascentM = totals.ascent
        descentM = totals.descent
        netChangeM = ordered.last!.relativeAltitudeM - first.relativeAltitudeM
    }
}

private extension RideElevationAnalysis {
    static func elevationTotalsForSummary(_ samples: [BarometerSample]) -> (ascent: Double, descent: Double) {
        guard let first = samples.first else { return (0, 0) }
        var ascent = 0.0
        var descent = 0.0
        var previous = first
        for sample in samples.dropFirst() {
            let elapsed = sample.timestampMs - previous.timestampMs
            let delta = sample.relativeAltitudeM - previous.relativeAltitudeM
            if elapsed > 0 && elapsed <= 15_000 && delta.isFinite && abs(delta) <= 8 {
                if delta >= 1 { ascent += delta }
                else if delta <= -1 { descent += abs(delta) }
            }
            previous = sample
        }
        return (ascent, descent)
    }
}
