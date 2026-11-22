import Foundation
import CoreLocation

/// A plotted point is derived data. Original GPS and barometer observations remain
/// untouched in Ride.points and Ride.barometerSamples.
struct RideElevationProfilePoint: Equatable, Identifiable {
    let id: Int
    let timestampMs: Int64
    let distanceM: Double
    let altitudeM: Double
    let segmentID: Int
}

struct RideSlopePoint: Equatable, Identifiable {
    let id: Int
    let distanceM: Double
    let gradePercent: Double
    let segmentID: Int
}

/// Shared GPS route-distance policy used by live recording, analysis and archive.
/// Invalid fixes break continuity; gaps and implausible jumps are never bridged.
/// Pause intervals use the PWA JSON-v1 wire representation (Unix milliseconds)
/// inside Ride.additionalFields so older archives remain lossless and compatible.
struct RidePauseInterval: Equatable {
    let startedAtSeconds: Double
    let endedAtSeconds: Double?
}

enum RidePauseIntervals {
    static func intervals(in ride: Ride) -> [RidePauseInterval] {
        guard case .array(let items) = ride.additionalFields["pauseIntervals"] else { return [] }
        return items.compactMap { item in
            guard case .object(let fields) = item,
                  case .number(let startMs)? = fields["startedAt"],
                  startMs.isFinite, startMs > 0 else { return nil }
            let endMs: Double?
            if case .number(let value)? = fields["endedAt"], value.isFinite, value >= startMs {
                endMs = value
            } else {
                endMs = nil
            }
            return RidePauseInterval(
                startedAtSeconds: startMs / 1_000,
                endedAtSeconds: endMs.map { $0 / 1_000 }
            )
        }
    }

    static func begin(_ ride: inout Ride, at seconds: Double) {
        guard seconds.isFinite, seconds > 0 else { return }
        var items: [JSONValue]
        if case .array(let existing) = ride.additionalFields["pauseIntervals"] {
            items = existing
        } else {
            items = []
        }
        items.append(.object([
            "startedAt": .number(seconds * 1_000),
            "endedAt": .null
        ]))
        ride.additionalFields["pauseIntervals"] = .array(items)
    }

    static func end(_ ride: inout Ride, at seconds: Double) {
        guard seconds.isFinite, seconds > 0,
              case .array(var items) = ride.additionalFields["pauseIntervals"] else { return }
        for index in items.indices.reversed() {
            guard case .object(var fields) = items[index] else { continue }
            let isOpen: Bool
            if let end = fields["endedAt"] {
                if case .null = end { isOpen = true } else { isOpen = false }
            } else {
                isOpen = true
            }
            guard isOpen else { continue }
            fields["endedAt"] = .number(seconds * 1_000)
            items[index] = .object(fields)
            break
        }
        ride.additionalFields["pauseIntervals"] = .array(items)
    }
}

/// A GPS interval accepted by the shared route-quality policy.
struct RideRouteSegment: Equatable {
    let startTimeSeconds: Double
    let endTimeSeconds: Double
    let distanceMeters: Double

    var elapsedSeconds: Double { endTimeSeconds - startTimeSeconds }
    var speedMetersPerSecond: Double {
        guard elapsedSeconds > 0 else { return 0 }
        return distanceMeters / elapsedSeconds
    }
}

/// Shared GPS route-distance policy used by live recording, analysis and archive.
/// Invalid fixes break continuity; gaps and implausible jumps are never bridged.
enum RideRouteMetrics {
    /// MTB recordings can contain short technical sections and very fast descents.
    /// Keep a generous accuracy envelope and judge jumps by elapsed time, not a
    /// fixed distance cap. Raw observations are never modified by this policy.
    static let maximumGapSeconds = 30.0
    static let maximumAcceptedAccuracyMeters = 50.0
    static let minimumSegmentMeters = 1.0
    static let minimumJumpAllowanceMeters = 80.0
    static let maximumPlausibleSpeedMetersPerSecond = 45.0

    static func isPlausibleSegment(
        distanceMeters: Double,
        elapsedSeconds: Double,
        previousAccuracyMeters: Double,
        currentAccuracyMeters: Double
    ) -> Bool {
        guard distanceMeters.isFinite, elapsedSeconds.isFinite, elapsedSeconds > 0 else {
            return false
        }
        let uncertaintyAllowance = max(0, previousAccuracyMeters) + max(0, currentAccuracyMeters)
        let allowedDistance = max(
            minimumJumpAllowanceMeters,
            elapsedSeconds * maximumPlausibleSpeedMetersPerSecond + uncertaintyAllowance
        )
        return distanceMeters <= allowedDistance
    }

    /// Returns only accepted moving intervals. This is the single source of truth
    /// for GPS distance, moving time and GPS-derived speed metrics.
    static func acceptedSegments(for points: [RidePoint]) -> [RideRouteSegment] {
        var result: [RideRouteSegment] = []
        var previous: RidePoint?

        for point in points {
            guard point.t.isFinite,
                  point.t > 0,
                  point.lat.isFinite, (-90.0...90.0).contains(point.lat),
                  point.lon.isFinite, (-180.0...180.0).contains(point.lon),
                  let accuracy = point.accuracy,
                  accuracy.isFinite, accuracy >= 0,
                  accuracy <= maximumAcceptedAccuracyMeters else {
                previous = nil
                continue
            }

            guard let prior = previous, let priorAccuracy = prior.accuracy else {
                previous = point
                continue
            }

            let elapsed = point.t - prior.t
            guard elapsed.isFinite, elapsed > 0 else {
                previous = point
                continue
            }
            guard elapsed <= maximumGapSeconds else {
                previous = point
                continue
            }

            let first = CLLocation(latitude: prior.lat, longitude: prior.lon)
            let second = CLLocation(latitude: point.lat, longitude: point.lon)
            let segment = second.distance(from: first)
            guard segment.isFinite else {
                previous = nil
                continue
            }
            guard isPlausibleSegment(
                distanceMeters: segment,
                elapsedSeconds: elapsed,
                previousAccuracyMeters: priorAccuracy,
                currentAccuracyMeters: accuracy
            ) else {
                previous = point
                continue
            }

            if segment >= minimumSegmentMeters {
                result.append(RideRouteSegment(
                    startTimeSeconds: prior.t,
                    endTimeSeconds: point.t,
                    distanceMeters: segment
                ))
                previous = point
            }
            // Sub-metre jitter is ignored without moving the anchor, allowing
            // consecutive small movements to accumulate on slow technical climbs.
        }

        return result
    }

    static func acceptedSegments(for ride: Ride) -> [RideRouteSegment] {
        let start = ride.startedAt.isFinite ? ride.startedAt : 0
        let latestGPS = ride.points.map(\\.t).filter { $0.isFinite && $0 > 0 }.max() ?? start
        let candidateEnd = ride.endedAt ?? ride.pauseStarted ?? latestGPS
        let end = max(start, candidateEnd.isFinite ? candidateEnd : start)
        let points = ride.points.filter {
            $0.t.isFinite && $0.t >= start - 10 && $0.t <= end + 10
        }
        let pauses = RidePauseIntervals.intervals(in: ride)
        return acceptedSegments(for: points).filter { segment in
            !pauses.contains { pause in
                let pauseEnd = pause.endedAtSeconds ?? .infinity
                return pause.startedAtSeconds < segment.endTimeSeconds &&
                    pauseEnd > segment.startTimeSeconds
            }
        }
    }

    static func distanceMeters(for points: [RidePoint]) -> Double {
        let total = acceptedSegments(for: points).reduce(0) { $0 + $1.distanceMeters }
        return total.isFinite ? total : 0
    }

    static func distanceMeters(for ride: Ride) -> Double {
        let total = acceptedSegments(for: ride).reduce(0) { $0 + $1.distanceMeters }
        return total.isFinite ? total : 0
    }
}

struct RideElevationAnalysis: Equatable {
    enum Reference: String, Equatable {
        case gpsCalibrated = "GPS-kalibriert"
        case partiallyGPSCalibrated = "Teilweise GPS-kalibriert"
        case barometerRelative = "Nur relative Barometerhöhe"
        case gpsOnly = "Nur GPS-Höhe"
        case unavailable = "Keine ausreichenden Höhendaten"
    }

    let profile: [RideElevationProfilePoint]
    let slopeProfile: [RideSlopePoint]
    let maxUphillGradePercent: Double?
    let maxDownhillGradePercent: Double?
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
            profile = []
            slopeProfile = []
            maxUphillGradePercent = nil
            maxDownhillGradePercent = nil
            ascentM = 0
            descentM = 0
            netChangeM = 0
            reference = .unavailable
            gpsAnchorCount = 0
            calibrationOffsetM = nil
            calibrationSpreadM = nil
            rawBarometerCount = 0
            usableGPSAltitudeCount = 0
            return
        }

        let gps = ride.points
            .filter {
                guard Self.timestampMilliseconds(from: $0.t) != nil,
                      $0.lat.isFinite, (-90.0...90.0).contains($0.lat),
                      $0.lon.isFinite, (-180.0...180.0).contains($0.lon) else {
                    return false
                }
                return $0.accuracy.map { $0 >= 0 && $0 <= 35 } == true
            }
            .sorted { $0.t < $1.t }

        let barometer = (ride.barometerSamples ?? [])
            .filter {
                $0.timestampMs > 0 && $0.pressureKPa.isFinite && $0.pressureKPa > 0 &&
                $0.relativeAltitudeM.isFinite
            }
            .sorted { $0.timestampMs < $1.timestampMs }

        let trustedGPS = gps.filter {
            guard $0.altSource == "coreLocation", let altitude = $0.alt, let accuracy = $0.altAccuracy else { return false }
            return altitude.isFinite && accuracy.isFinite && accuracy >= 0 && accuracy <= 15
        }

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
                guard let timestamp = Self.timestampMilliseconds(from: point.t),
                      let sample = Self.nearestBarometer(
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
        // Expose the worst measurable session MAD even when calibration is
        // rejected. This makes poor reference quality visible instead of hiding it.
        let calibrationSpread = calibrationBySession.values
            .filter { $0.anchorCount >= 2 }
            .compactMap { $0.spread }
            .max()
        let totalAnchorCount = calibrationBySession.values.reduce(0) { $0 + $1.anchorCount }

        // Keep invalid observations in the route input so they explicitly break continuity.
        // The calibration set above remains filtered to trusted GPS fixes.
        let route = Self.makeRoute(ride.points)
        var plotted: [RideElevationProfilePoint] = []
        var profileSegmentIDs: [String: Int] = [:]

        if !barometer.isEmpty {
            var previousSample: BarometerSample?
            var barometerGapSegment = 0
            for sample in barometer {
                if let previous = previousSample {
                    let elapsedMs = sample.timestampMs - previous.timestampMs
                    if sample.sessionID != previous.sessionID || elapsedMs <= 0 || elapsedMs > 15_000 {
                        barometerGapSegment += 1
                    }
                }
                previousSample = sample
                guard let position = Self.distance(at: sample.timestampMs, on: route) else { continue }
                let sessionKey = sample.sessionID?.uuidString ?? "legacy"
                let calibration = calibrationBySession[sessionKey]
                let altitude = sample.relativeAltitudeM +
                    ((calibration?.calibrated == true) ? (calibration?.offset ?? 0) : 0)
                guard altitude.isFinite else { continue }
                let segmentKey = "\(sessionKey)|\(position.segmentID)|\(barometerGapSegment)"
                if profileSegmentIDs[segmentKey] == nil {
                    profileSegmentIDs[segmentKey] = profileSegmentIDs.count
                }
                plotted.append(RideElevationProfilePoint(
                    id: plotted.count,
                    timestampMs: sample.timestampMs,
                    distanceM: position.distanceM,
                    altitudeM: altitude,
                    segmentID: profileSegmentIDs[segmentKey] ?? position.segmentID
                ))
            }
        } else {
            // Explicit GPS-only fallback; never label this as barometer fusion.
            for point in trustedGPS {
                guard let altitude = point.alt,
                      let timestamp = Self.timestampMilliseconds(from: point.t),
                      let position = Self.distance(at: timestamp, on: route) else { continue }
                plotted.append(RideElevationProfilePoint(
                    id: plotted.count,
                    timestampMs: timestamp,
                    distanceM: position.distanceM,
                    altitudeM: altitude,
                    segmentID: position.segmentID
                ))
            }
        }

        let computedProfile = plotted
        let computedSlopeProfile = Self.makeSlopeProfile(computedProfile)
        let computedMaxUphillGrade = computedSlopeProfile.map { $0.gradePercent }.filter { $0 > 0 }.max()
        let computedMaxDownhillGrade = computedSlopeProfile.map { $0.gradePercent }.filter { $0 < 0 }.min()
        let computedReference: Reference
        let computedCalibrationOffset: Double?
        let computedCalibrationSpread: Double?
        let computedAnchorCount: Int

        if allSessionsCalibrated {
            computedReference = .gpsCalibrated
            computedCalibrationOffset = calibrationOffset
            computedCalibrationSpread = calibrationSpread
            computedAnchorCount = totalAnchorCount
        } else if hasCalibratedSession {
            computedReference = .partiallyGPSCalibrated
            computedCalibrationOffset = calibrationOffset
            computedCalibrationSpread = calibrationSpread
            computedAnchorCount = totalAnchorCount
        } else if !barometer.isEmpty {
            computedReference = .barometerRelative
            computedCalibrationOffset = nil
            computedCalibrationSpread = calibrationSpread
            computedAnchorCount = totalAnchorCount
        } else if !plotted.isEmpty {
            computedReference = .gpsOnly
            computedCalibrationOffset = nil
            computedCalibrationSpread = nil
            computedAnchorCount = 0
        } else {
            computedReference = .unavailable
            computedCalibrationOffset = nil
            computedCalibrationSpread = nil
            computedAnchorCount = 0
        }

        let totals = Self.elevationTotals(computedProfile)
        let computedNetChange: Double
        if let first = computedProfile.first, let last = computedProfile.last,
           first.segmentID == last.segmentID {
            computedNetChange = last.altitudeM - first.altitudeM
        } else {
            computedNetChange = 0
        }

        // Initialize every stored property exactly once, after all calculations.
        profile = computedProfile
        slopeProfile = computedSlopeProfile
        maxUphillGradePercent = computedMaxUphillGrade
        maxDownhillGradePercent = computedMaxDownhillGrade
        ascentM = totals.ascent
        descentM = totals.descent
        netChangeM = computedNetChange
        reference = computedReference
        gpsAnchorCount = computedAnchorCount
        calibrationOffsetM = computedCalibrationOffset
        calibrationSpreadM = computedCalibrationSpread
        rawBarometerCount = ride.barometerSamples?.count ?? 0
        usableGPSAltitudeCount = trustedGPS.count
    }

    private init(empty: Void) {
        profile = []
        slopeProfile = []
        maxUphillGradePercent = nil
        maxDownhillGradePercent = nil
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

    /// Converts Unix seconds to positive Int64 milliseconds without trapping on
    /// malformed or extreme imported timestamps.
    private static func timestampMilliseconds(from seconds: Double) -> Int64? {
        guard seconds.isFinite else { return nil }
        let milliseconds = (seconds * 1_000).rounded()
        // Double(Int64.max) rounds to 2^63, the first value outside Int64.
        guard milliseconds.isFinite,
              milliseconds > 0,
              milliseconds < Double(Int64.max) else { return nil }
        return Int64(milliseconds)
    }

    private static func makeRoute(_ points: [RidePoint]) -> [RoutePoint] {
        // Preserve observation order so malformed timestamps also break continuity,
        // exactly as they do in the shared live/archive distance calculation.
        let ordered = points
        var result: [RoutePoint] = []
        var distance = 0.0
        var segmentID = 0
        var previous: RidePoint?

        for point in ordered {
            guard let timestamp = Self.timestampMilliseconds(from: point.t),
                  point.lat.isFinite, (-90.0...90.0).contains(point.lat),
                  point.lon.isFinite, (-180.0...180.0).contains(point.lon),
                  let accuracy = point.accuracy,
                  accuracy.isFinite, accuracy >= 0, accuracy <= RideRouteMetrics.maximumAcceptedAccuracyMeters else {
                if previous != nil { segmentID += 1 }
                previous = nil
                continue
            }

            guard let previousPoint = previous,
                  let previousTimestamp = Self.timestampMilliseconds(from: previousPoint.t) else {
                result.append(RoutePoint(timestampMs: timestamp, distanceM: distance, segmentID: segmentID))
                previous = point
                continue
            }

            let elapsedMs = timestamp - previousTimestamp
            guard elapsedMs > 0 else {
                segmentID += 1
                result.append(RoutePoint(timestampMs: timestamp, distanceM: distance, segmentID: segmentID))
                previous = point
                continue
            }

            guard elapsedMs <= Int64(RideRouteMetrics.maximumGapSeconds * 1_000) else {
                segmentID += 1
                result.append(RoutePoint(timestampMs: timestamp, distanceM: distance, segmentID: segmentID))
                previous = point
                continue
            }

            let first = CLLocation(latitude: previousPoint.lat, longitude: previousPoint.lon)
            let second = CLLocation(latitude: point.lat, longitude: point.lon)
            let segment = second.distance(from: first)
            guard segment.isFinite else {
                segmentID += 1
                previous = nil
                continue
            }
            guard RideRouteMetrics.isPlausibleSegment(
                distanceMeters: segment,
                elapsedSeconds: Double(elapsedMs) / 1_000,
                previousAccuracyMeters: previousPoint.accuracy ?? .infinity,
                currentAccuracyMeters: accuracy
            ) else {
                segmentID += 1
                result.append(RoutePoint(timestampMs: timestamp, distanceM: distance, segmentID: segmentID))
                previous = point
                continue
            }
            guard segment >= RideRouteMetrics.minimumSegmentMeters else {
                // Match live/archive distance: ignore sub-metre jitter without moving the anchor, so slow MTB movement can accumulate.
                continue
            }

            distance += segment
            result.append(RoutePoint(timestampMs: timestamp, distanceM: distance, segmentID: segmentID))
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
                  left.segmentID == right.segmentID,
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

    /// Computes distance-based grade over non-overlapping windows of at least 20 m.
    /// Windows never cross a GPS/session segment or a 30-second sample gap. A
    /// vertical jump over 8 m is ignored for grade calculation without altering
    /// the plotted observation or advancing the last trusted anchor.
    private static func makeSlopeProfile(_ points: [RideElevationProfilePoint]) -> [RideSlopePoint] {
        let minimumWindowDistanceM = 20.0
        let maximumWindowDurationMs: Int64 = 30_000
        let maximumTrustedElevationStepM = 8.0

        var result: [RideSlopePoint] = []
        var anchor: RideElevationProfilePoint?

        for point in points {
            guard let previous = anchor else {
                anchor = point
                continue
            }

            guard point.segmentID == previous.segmentID else {
                anchor = point
                continue
            }

            let elapsedMs = point.timestampMs - previous.timestampMs
            guard elapsedMs > 0 else { continue }
            guard elapsedMs <= maximumWindowDurationMs else {
                anchor = point
                continue
            }

            let distanceDelta = point.distanceM - previous.distanceM
            guard distanceDelta.isFinite, distanceDelta > 0 else { continue }
            guard distanceDelta >= minimumWindowDistanceM else { continue }

            let altitudeDelta = point.altitudeM - previous.altitudeM
            guard altitudeDelta.isFinite else {
                anchor = point
                continue
            }
            // Treat isolated spikes consistently with the ascent/descent totals.
            // Keep the previous anchor so the recovery sample is not discarded too.
            guard abs(altitudeDelta) <= maximumTrustedElevationStepM else { continue }

            let grade = altitudeDelta / distanceDelta * 100
            guard grade.isFinite else {
                anchor = point
                continue
            }
            result.append(RideSlopePoint(
                id: result.count,
                distanceM: point.distanceM,
                gradePercent: grade,
                segmentID: point.segmentID
            ))
            anchor = point
        }

        return result
    }

    private static func elevationTotals(_ points: [RideElevationProfilePoint]) -> (ascent: Double, descent: Double) {
        guard let first = points.first else { return (0, 0) }
        var ascent = 0.0
        var descent = 0.0
        var previous = first.altitudeM
        var previousTimestampMs = points[0].timestampMs
        var previousSegment = points[0].segmentID
        for point in points.dropFirst() {
            if point.segmentID != previousSegment {
                previous = point.altitudeM
                previousTimestampMs = point.timestampMs
                previousSegment = point.segmentID
                continue
            }
            let elapsedMs = point.timestampMs - previousTimestampMs
            previousTimestampMs = point.timestampMs
            guard elapsedMs > 0, elapsedMs <= 15_000 else {
                previous = point.altitudeM
                continue
            }
            let delta = point.altitudeM - previous
            // Reject isolated jumps; keep the raw observation in the ride archive.
            // Do not advance the trusted baseline on a rejected spike, otherwise
            // the following recovery sample would be rejected as a second spike.
            guard delta.isFinite, abs(delta) <= 8 else { continue }
            if delta >= 1 { ascent += delta }
            else if delta <= -1 { descent += abs(delta) }
            previous = point.altitudeM
        }
        return (ascent, descent)
    }
}

/// Compatibility summary for the existing dashboard.
struct RideElevationSummary: Equatable {
    static let maximumSampleGapMs: Int64 = 15_000
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
        let sessionKeys = Set(ordered.map { $0.sessionID?.uuidString ?? "legacy" })
        netChangeM = sessionKeys.count == 1
            ? ordered.last!.relativeAltitudeM - first.relativeAltitudeM
            : 0
    }
}

extension RideElevationAnalysis {
    fileprivate static func elevationTotalsForSummary(_ samples: [BarometerSample]) -> (ascent: Double, descent: Double) {
        guard let first = samples.first else { return (0, 0) }
        var ascent = 0.0
        var descent = 0.0
        // Keep the last trusted altitude separate from the last observed timestamp.
        // This lets the summary recover after one rejected spike without treating
        // the following, otherwise continuous sensor sample as a long data gap.
        var trustedBaseline = first
        var lastObservedTimestampMs = first.timestampMs

        for sample in samples.dropFirst() {
            guard sample.sessionID == trustedBaseline.sessionID else {
                trustedBaseline = sample
                lastObservedTimestampMs = sample.timestampMs
                continue
            }

            let observedInterval = sample.timestampMs - lastObservedTimestampMs
            lastObservedTimestampMs = sample.timestampMs
            guard observedInterval > 0, observedInterval <= RideElevationSummary.maximumSampleGapMs else {
                trustedBaseline = sample
                continue
            }

            let delta = sample.relativeAltitudeM - trustedBaseline.relativeAltitudeM
            // Reject isolated spikes without advancing the trusted altitude.
            // The observation timestamp still advances, so the next normal
            // sample can be compared with the last trusted altitude.
            guard delta.isFinite, abs(delta) <= 8 else { continue }
            if delta >= 1 { ascent += delta }
            else if delta <= -1 { descent += abs(delta) }
            trustedBaseline = sample
        }
        return (ascent, descent)
    }
}


/// Performance metrics derived from immutable GPS and Watch observations.
/// Missing sensor streams remain nil; no zero values are fabricated.
struct RidePerformanceAnalysis: Equatable {
    let elapsedSeconds: Double
    let movingSeconds: Double
    let gpsDistanceMeters: Double
    let averageSpeedMetersPerSecond: Double?
    let maximumSpeedMetersPerSecond: Double?
    let gpsSegmentCount: Int

    let averageHeartRateBPM: Double?
    let maximumHeartRateBPM: Double?
    let averageCadenceRPM: Double?
    let maximumCadenceRPM: Double?
    let averagePowerWatts: Double?
    let maximumPowerWatts: Double?
    let averageWatchSpeedMetersPerSecond: Double?
    let maximumWatchSpeedMetersPerSecond: Double?
    /// HealthKit statistics are cumulative; use the latest observation, never sum snapshots.
    let activeEnergyKcal: Double?
    let watchDistanceMeters: Double?
    let watchSampleCount: Int

    init(ride: Ride) {
        let start = ride.startedAt.isFinite ? ride.startedAt : 0
        let lastGPS = ride.points.map(\.t).filter { $0.isFinite && $0 > 0 }.max() ?? start
        let candidateEnd = ride.endedAt ?? ride.pauseStarted ?? lastGPS
        let effectiveEnd = max(start, candidateEnd.isFinite ? candidateEnd : start)
        let wallDuration = max(0, effectiveEnd - start)
        let completedPauseSeconds = max(0, (ride.pausedMs ?? 0).isFinite ? (ride.pausedMs ?? 0) / 1_000 : 0)
        elapsedSeconds = max(0, wallDuration - completedPauseSeconds)

        let routePoints = ride.points.filter {
            $0.t.isFinite && $0.t >= start - 10 && $0.t <= effectiveEnd + 10
        }
        let segments = RideRouteMetrics.acceptedSegments(for: ride)
        let distance = segments.reduce(0) { $0 + $1.distanceMeters }
        let measuredMovingSeconds = segments.reduce(0) { $0 + $1.elapsedSeconds }
        movingSeconds = min(elapsedSeconds, max(0, measuredMovingSeconds))
        gpsDistanceMeters = distance.isFinite ? distance : 0
        gpsSegmentCount = segments.count
        averageSpeedMetersPerSecond = movingSeconds > 0 ? gpsDistanceMeters / movingSeconds : nil
        maximumSpeedMetersPerSecond = segments.map(\.speedMetersPerSecond).filter(\.isFinite).max()

        let lowerBoundMs = max(0, (start - 10) * 1_000)
        let upperBoundMs = (effectiveEnd + 10) * 1_000
        let watchSamples = (ride.watchSamples ?? []).filter {
            $0.rideID == ride.id &&
            $0.isValidObservation() &&
            Double($0.timestampMs) >= lowerBoundMs &&
            Double($0.timestampMs) <= upperBoundMs
        }
        watchSampleCount = watchSamples.count

        func values(_ kind: WatchSensorSample.Kind) -> [Double] {
            watchSamples.filter { $0.kind == kind }.map(\.value)
        }
        func average(_ kind: WatchSensorSample.Kind) -> Double? {
            let items = values(kind)
            guard !items.isEmpty else { return nil }
            let result = items.reduce(0, +) / Double(items.count)
            return result.isFinite ? result : nil
        }
        func maximum(_ kind: WatchSensorSample.Kind) -> Double? {
            values(kind).max()
        }
        func latest(_ kind: WatchSensorSample.Kind) -> Double? {
            watchSamples
                .filter { $0.kind == kind }
                .max { $0.timestampMs < $1.timestampMs }?
                .value
        }

        averageHeartRateBPM = average(.heartRateBPM)
        maximumHeartRateBPM = maximum(.heartRateBPM)
        averageCadenceRPM = average(.cadenceRPM)
        maximumCadenceRPM = maximum(.cadenceRPM)
        averagePowerWatts = average(.cyclingPowerWatts)
        maximumPowerWatts = maximum(.cyclingPowerWatts)
        averageWatchSpeedMetersPerSecond = average(.speedMetersPerSecond)
        maximumWatchSpeedMetersPerSecond = maximum(.speedMetersPerSecond)
        activeEnergyKcal = latest(.activeEnergyKcal)
        watchDistanceMeters = latest(.distanceMeters)
    }
}
