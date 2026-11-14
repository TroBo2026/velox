import Foundation
import CoreLocation

/// A plotted point is derived data. Original GPS and barometer observations remain
/// untouched in Ride.points and Ride.barometerSamples.
struct RideElevationProfilePoint: Equatable, Identifiable {
    let id: Int
    let distanceM: Double
    let altitudeM: Double
    let segmentID: Int
}

struct RideElevationAnalysis: Equatable {
    enum Reference: String {
        case gpsCalibrated = "GPS-kalibriert"
        case partiallyGPSCalibrated = "Teilweise GPS-kalibriert"
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

        // Calibrate each independent Core Motion session separately. A pause
        // restarts the sensor session, so its relative-altitude zero is never
        // incorrectly joined to the previous session.
        var calibrationBySession: [String: (offset: Double?, spread: Double?, anchorCount: Int, calibrated: Bool)] = [:]
        let barometerSessions = Dictionary(grouping: barometer) {
            $0.sessionID?.uuidString ?? "legacy"
        }

        for (sessionKey, sessionSamples) in barometerSessions {
            var usedBarometerTimestamps = Set<Int64>()
            let offsets: [Double] = trustedGPS.compactMap { point in
                let timestamp = Int64((point.t * 1_000).rounded())
                guard let sample = Self.nearestBarometer(
                    to: timestamp,
                    in: sessionSamples,
                    maxDifferenceMs: 10_000
                ), usedBarometerTimestamps.insert(sample.timestampMs).inserted,
                   let gpsAltitude = point.alt else { return nil }
                let value = gpsAltitude - sample.relativeAltitudeM
                return value.isFinite ? value : nil
            }

            let sortedOffsets = offsets.sorted()
            let sessionOffset = Self.median(sortedOffsets)
            let sessionSpread = sessionOffset.flatMap { value in
                Self.median(sortedOffsets.map { abs($0 - value) }.sorted())
            }
            let isCalibrated = sortedOffsets.count >= 3 && (sessionSpread ?? .infinity) <= 10
            calibrationBySession[sessionKey] = (
                sessionOffset,
                sessionSpread,
                sortedOffsets.count,
                isCalibrated
            )
        }

        let calibratedSessionCount = calibrationBySession.values.filter { $0.calibrated }.count
        let hasCalibratedSession = calibratedSessionCount > 0
        let allSessionsCalibrated = !barometerSessions.isEmpty &&
            calibratedSessionCount == barometerSessions.count
        let calibrationOffset = Self.median(
            calibrationBySession.values
                .filter { $0.calibrated }
                .compactMap { $0.offset }
                .sorted()
        )
        let calibrationSpread = Self.median(
            calibrationBySession.values
                .filter { $0.calibrated }
                .compactMap { $0.spread }
                .sorted()
        )
        let totalAnchorCount = calibrationBySession.values.reduce(0) { $0 + $1.anchorCount }

        let route = Self.makeRoute(gps)
        var plotted: [RideElevationProfilePoint] = []
        var profileSegmentIDs: [String: Int] = [:]

        if !barometer.isEmpty {
            for sample in barometer {
                guard let position = Self.distance(at: sample.timestampMs, on: route) else { continue }
                let sessionKey = sample.sessionID?.uuidString ?? "legacy"
                let calibration = calibrationBySession[sessionKey]
                let altitude = sample.relativeAltitudeM +
                    ((calibration?.calibrated == true) ? (calibration?.offset ?? 0) : 0)
                guard altitude.isFinite else { continue }
                let segmentKey = "\(sessionKey)|\(position.segmentID)"
                if profileSegmentIDs[segmentKey] == nil {
                    profileSegmentIDs[segmentKey] = profileSegmentIDs.count
                }
                plotted.append(RideElevationProfilePoint(
                    id: plotted.count,
                    distanceM: position.distanceM,
                    altitudeM: altitude,
                    segmentID: profileSegmentIDs[segmentKey] ?? position.segmentID
                ))
            }
        } else {
            // Explicit GPS-only fallback; never label this as barometer fusion.
            for point in trustedGPS {
                guard let altitude = point.alt, let position = Self.distance(at: Int64((point.t * 1_000).rounded()), on: route) else { continue }
                plotted.append(RideElevationProfilePoint(
                    id: plotted.count,
                    distanceM: position.distanceM,
                    altitudeM: altitude,
                    segmentID: position.segmentID
                ))
            }
        }

        profile = plotted
        if allSessionsCalibrated {
            reference = .gpsCalibrated
            calibrationOffsetM = calibrationOffset
            calibrationSpreadM = calibrationSpread
            gpsAnchorCount = totalAnchorCount
        } else if hasCalibratedSession {
            reference = .partiallyGPSCalibrated
            calibrationOffsetM = calibrationOffset
            calibrationSpreadM = calibrationSpread
            gpsAnchorCount = totalAnchorCount
        } else if !barometer.isEmpty {
            reference = .barometerRelative
            calibrationOffsetM = nil
            calibrationSpreadM = nil
            gpsAnchorCount = totalAnchorCount
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
        let segmentID: Int
    }

    private static func makeRoute(_ points: [RidePoint]) -> [RoutePoint] {
        var result: [RoutePoint] = []
        var distance = 0.0
        var segmentID = 0
        var previous: RidePoint?
        for point in points {
            guard let previousPoint = previous else {
                result.append(RoutePoint(timestampMs: Int64((point.t * 1_000).rounded()), distanceM: distance, segmentID: segmentID))
                previous = point
                continue
            }
            let elapsedMs = Int64(((point.t - previousPoint.t) * 1_000).rounded())
            guard elapsedMs > 0 else { continue }
            let a = CLLocation(latitude: previousPoint.lat, longitude: previousPoint.lon)
            let b = CLLocation(latitude: point.lat, longitude: point.lon)
            let segment = b.distance(from: a)
            guard elapsedMs <= 30_000, segment.isFinite, segment >= 0, segment <= 120 else {
                // Start a new segment; never connect or total elevation across this gap.
                segmentID += 1
                result.append(RoutePoint(timestampMs: Int64((point.t * 1_000).rounded()), distanceM: distance, segmentID: segmentID))
                previous = point
                continue
            }
            distance += segment
            result.append(RoutePoint(timestampMs: Int64((point.t * 1_000).rounded()), distanceM: distance, segmentID: segmentID))
            previous = point
        }
        return result
    }

    private static func distance(at timestamp: Int64, on route: [RoutePoint]) -> (distanceM: Double, segmentID: Int)? {
        guard route.count >= 2 else { return nil }
        for index in 1..<route.count {
            let left = route[index - 1]
            let right = route[index]
            let duration = right.timestampMs - left.timestampMs
            guard duration > 0, duration <= 30_000,
                  timestamp >= left.timestampMs, timestamp <= right.timestampMs else { continue }
            let fraction = Double(timestamp - left.timestampMs) / Double(duration)
            return (left.distanceM + (right.distanceM - left.distanceM) * fraction, left.segmentID)
        }
        return nil
    }

    private static func nearestBarometer(to timestamp: Int64, in samples: [BarometerSample], maxDifferenceMs: Int64) -> BarometerSample? {
        samples.min { abs($0.timestampMs - timestamp) < abs($1.timestampMs - timestamp) }
            .flatMap { abs($0.timestampMs - timestamp) <= maxDifferenceMs ? $0 : nil }
    }

    private static func median(_ values: [Double]) -> Double? {
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
        var previousSegment = points[0].segmentID
        for point in points.dropFirst() {
            if point.segmentID != previousSegment {
                previous = point.altitudeM
                previousSegment = point.segmentID
                continue
            }
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

extension RideElevationAnalysis {
    fileprivate static func elevationTotalsForSummary(_ samples: [BarometerSample]) -> (ascent: Double, descent: Double) {
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
