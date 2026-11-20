import Foundation

@main
struct RideAnalysisValidation {
    private static let defaultSessionID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!

    static func main() {
        testEmptyRide()
        testMalformedGPSIsIgnoredWithoutCrashing()
        testStableGPSCalibration()
        testInsufficientAnchorsStayRelative()
        testUnstableAnchorsStayRelative()
        testGPSGapSplitsElevationTotals()
        testPauseResumeSessionsCalibrateIndependently()
        testElevationOutlierAndRawDataIntegrity()
        testCompatibilitySummarySeparatesSessionsAndOutliers()
        testSharedRouteDistanceDoesNotBridgeGPSGaps()
        testMTBSlowTechnicalMovementIsAccumulated()
        testMTBFastDescentIsPreserved()
        testMTBAccuracyEnvelopeIsNotOverlyStrict()
        print("VELOX elevation and route-distance validation: 13/13 checks passed")
    }

    private static func testEmptyRide() {
        let result = RideElevationAnalysis(ride: nil)
        expect(result.reference == .unavailable, "nil ride reference")
        expect(result.profile.isEmpty && result.ascentM == 0 && result.descentM == 0, "nil ride values")
    }

    private static func testMalformedGPSIsIgnoredWithoutCrashing() {
        let start = 1_700_000_000.0
        let invalidTimestamp = RidePoint(
            lat: 51, lon: 13, t: 1e300, alt: 900, altAccuracy: 1,
            altSource: "coreLocation", pressureKPa: nil, accuracy: 5
        )
        let invalidLatitude = RidePoint(
            lat: 91, lon: 13, t: start + 5, alt: 500, altAccuracy: 1,
            altSource: "coreLocation", pressureKPa: nil, accuracy: 5
        )
        let invalidLongitude = RidePoint(
            lat: 51, lon: 181, t: start + 6, alt: 500, altAccuracy: 1,
            altSource: "coreLocation", pressureKPa: nil, accuracy: 5
        )
        let points = [
            gpsPoint(time: start, altitude: nil),
            gpsPoint(time: start + 10, altitude: nil),
            invalidTimestamp,
            invalidLatitude,
            invalidLongitude
        ]
        let ride = Ride(
            id: "malformed-gps-test",
            name: nil,
            startedAt: start,
            endedAt: nil,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: points,
            barometerSamples: [
                sample(time: start + 1, altitude: 0),
                sample(time: start + 9, altitude: 1)
            ],
            importedFromId: nil
        )
        let originalGPS = ride.points
        let result = RideElevationAnalysis(ride: ride)

        expect(result.reference == .barometerRelative, "invalid GPS references are not trusted")
        expect(result.profile.count == 2, "valid route points still support the profile")
        expect(result.usableGPSAltitudeCount == 0, "invalid coordinates and extreme time are excluded")
        expect(result.rawBarometerCount == 2, "barometer observations remain available")
        expect(ride.points == originalGPS, "malformed source observations are not rewritten")
    }

    private static func testStableGPSCalibration() {
        let ride = makeRide(
            gpsAltitudes: [100, 101, 102],
            barometerAltitudes: [0, 1, 2],
            offsetsInSeconds: [1, 11, 19]
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.reference == .gpsCalibrated, "three stable anchors calibrate")
        expect(result.gpsAnchorCount == 3, "all three anchors counted")
        expect(close(result.calibrationOffsetM, to: 100), "median calibration offset")
        expect(close(result.calibrationSpreadM, to: 0), "stable calibration spread")
        expect(result.profile.count == 3, "three plotted barometer samples")
        expect(abs(result.ascentM - 2) < 0.001, "calibrated ascent total")
        expect(result.rawBarometerCount == 3, "raw barometer count retained")
    }

    private static func testInsufficientAnchorsStayRelative() {
        let ride = makeRide(
            gpsAltitudes: [100, 101],
            barometerAltitudes: [0, 1],
            offsetsInSeconds: [1, 9]
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.reference == .barometerRelative, "two anchors do not calibrate")
        expect(result.calibrationOffsetM == nil, "no offset exposed without calibration")
        expect(result.gpsAnchorCount == 2, "two candidate anchors reported")
        expect(close(result.calibrationSpreadM, to: 0), "candidate spread remains diagnosable")
    }

    private static func testUnstableAnchorsStayRelative() {
        let ride = makeRide(
            gpsAltitudes: [100, 121, 142],
            barometerAltitudes: [0, 1, 2],
            offsetsInSeconds: [1, 11, 19]
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.reference == .barometerRelative, "unstable references do not calibrate")
        expect(result.calibrationOffsetM == nil, "unstable offset is not applied")
        expect(close(result.calibrationSpreadM, to: 20), "unstable spread remains visible")
    }

    private static func testGPSGapSplitsElevationTotals() {
        let start = 1_700_000_000.0
        let ride = Ride(
            id: "gap-test",
            name: nil,
            startedAt: start,
            endedAt: nil,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: [
                gpsPoint(time: start, altitude: nil),
                gpsPoint(time: start + 10, altitude: nil, longitude: 13.0001),
                gpsPoint(time: start + 70, altitude: nil),
                gpsPoint(time: start + 80, altitude: nil)
            ],
            barometerSamples: [
                sample(time: start + 1, altitude: 0),
                sample(time: start + 9, altitude: 3),
                sample(time: start + 71, altitude: 50),
                sample(time: start + 79, altitude: 53)
            ],
            importedFromId: nil
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.profile.count == 4, "profile retains points on both sides of gap")
        expect(result.profile[1].segmentID != result.profile[2].segmentID, "long GPS gap splits profile")
        expect(abs(result.ascentM - 6) < 0.001, "elevation total excludes gap jump")
        expect(abs(result.netChangeM) < 0.001, "net change is not joined across segments")
        expect(result.rawBarometerCount == 4, "raw samples remain counted")
    }

    private static func testPauseResumeSessionsCalibrateIndependently() {
        let start = 1_700_000_000.0
        let firstSession = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
        let secondSession = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
        let gpsTimes = [0.0, 10, 20, 100, 110, 120]
        let gpsAltitudes = [100.0, 101, 102, 200, 201, 202]
        let gps = zip(gpsTimes, gpsAltitudes).map { time, altitude in
            gpsPoint(time: start + time, altitude: altitude)
        }
        let barometer = [
            sample(time: start + 1, altitude: 0, sessionID: firstSession),
            sample(time: start + 11, altitude: 1, sessionID: firstSession),
            sample(time: start + 19, altitude: 2, sessionID: firstSession),
            sample(time: start + 101, altitude: 0, sessionID: secondSession),
            sample(time: start + 111, altitude: 1, sessionID: secondSession),
            sample(time: start + 119, altitude: 2, sessionID: secondSession)
        ]
        let ride = Ride(
            id: "pause-resume-test",
            name: nil,
            startedAt: start,
            endedAt: nil,
            pausedMs: 80_000,
            pauseStarted: nil,
            status: "completed",
            points: gps,
            barometerSamples: barometer,
            importedFromId: nil
        )

        let result = RideElevationAnalysis(ride: ride)
        expect(result.reference == .gpsCalibrated, "both sensor sessions calibrate")
        expect(result.gpsAnchorCount == 6, "anchors are counted per independent session")
        expect(result.profile.count == 6, "both sessions remain in the profile")
        expect(close(result.profile[0].altitudeM, to: 100), "first session uses its own offset")
        expect(close(result.profile[2].altitudeM, to: 102), "first session endpoint stays calibrated")
        expect(close(result.profile[3].altitudeM, to: 200), "resumed session uses a new offset")
        expect(close(result.profile[5].altitudeM, to: 202), "resumed session endpoint stays calibrated")
        expect(result.profile[2].segmentID != result.profile[3].segmentID, "pause/resume profile segments stay separate")
    }

    private static func testElevationOutlierAndRawDataIntegrity() {
        let start = 1_700_000_000.0
        let ride = Ride(
            id: "outlier-test",
            name: nil,
            startedAt: start,
            endedAt: nil,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: zip(
                [0.0, 10, 20, 30, 40, 50, 60],
                [13.0, 13.0003, 13.0006, 13.0009, 13.0012, 13.0015, 13.0018]
            ).map { offset, longitude in
                gpsPoint(time: start + offset, altitude: nil, longitude: longitude)
            },
            barometerSamples: [
                sample(time: start + 1, altitude: 0),
                sample(time: start + 11, altitude: 2),
                sample(time: start + 21, altitude: 40),
                sample(time: start + 31, altitude: 4),
                sample(time: start + 41, altitude: 6),
                sample(time: start + 51, altitude: 3)
            ],
            importedFromId: nil
        )
        let originalGPS = ride.points
        let originalBarometer = ride.barometerSamples
        let result = RideElevationAnalysis(ride: ride)

        expect(result.profile.count == 6, "outlier remains visible in derived profile")
        expect(close(result.profile[2].altitudeM, to: 40), "outlier value is not rewritten")
        expect(abs(result.ascentM - 6) < 0.001, "recovery samples after an isolated spike remain countable")
        expect(abs(result.descentM - 3) < 0.001, "valid descent after an isolated spike remains countable")
        expect(result.slopeProfile.count == 4, "distance-based slope windows are calculated")
        expect((result.maxUphillGradePercent ?? 0) > 9 && (result.maxUphillGradePercent ?? 0) < 10, "uphill grade uses distance and calibrated height")
        expect((result.maxDownhillGradePercent ?? 0) < -13.5 && (result.maxDownhillGradePercent ?? 0) > -15, "downhill grade preserves its negative sign")
        expect(result.rawBarometerCount == 6, "raw barometer sample count preserved")
        expect(ride.points == originalGPS, "GPS raw observations remain unchanged")
        expect(ride.barometerSamples == originalBarometer, "barometer raw observations remain unchanged")
    }

    private static func testCompatibilitySummarySeparatesSessionsAndOutliers() {
        let start = 1_700_000_000.0
        let firstSession = UUID(uuidString: "33333333-3333-3333-3333-333333333333")!
        let secondSession = UUID(uuidString: "44444444-4444-4444-4444-444444444444")!
        let samples = [
            sample(time: start + 1, altitude: 0, sessionID: firstSession),
            sample(time: start + 11, altitude: 2, sessionID: firstSession),
            sample(time: start + 21, altitude: 40, sessionID: firstSession),
            sample(time: start + 31, altitude: 4, sessionID: firstSession),
            sample(time: start + 41, altitude: 6, sessionID: firstSession),
            sample(time: start + 101, altitude: 100, sessionID: secondSession),
            sample(time: start + 111, altitude: 101, sessionID: secondSession)
        ]

        let summary = RideElevationSummary(samples: samples)
        expect(abs(summary.ascentM - 7) < 0.001, "summary resets at a new sensor session and recovers after spikes")
        expect(abs(summary.descentM) < 0.001, "summary excludes the isolated spike")
        expect(abs(summary.netChangeM) < 0.001, "relative session zeros are never compared")
    }

    private static func testSharedRouteDistanceDoesNotBridgeGPSGaps() {
        let start = 1_700_000_000.0
        let points = [
            gpsPoint(time: start, altitude: nil, longitude: 13.0000),
            gpsPoint(time: start + 10, altitude: nil, longitude: 13.0010),
            // A 60-second gap must split the route; this jump is not counted.
            gpsPoint(time: start + 70, altitude: nil, longitude: 13.0100),
            gpsPoint(time: start + 80, altitude: nil, longitude: 13.0110)
        ]

        let distance = RideRouteMetrics.distanceMeters(for: points)
        expect(distance > 130 && distance < 150, "shared distance excludes the long-gap bridge")

        let invalidAccuracy = RidePoint(
            lat: 51, lon: 13.0200, t: start + 90, alt: nil,
            altAccuracy: nil, altSource: nil, pressureKPa: nil, accuracy: 80
        )
        let withInvalidFix = RideRouteMetrics.distanceMeters(for: points + [invalidAccuracy])
        expect(abs(withInvalidFix - distance) < 0.001, "invalid-accuracy fixes do not add distance")
    }

    private static func testMTBSlowTechnicalMovementIsAccumulated() {
        let start = 1_700_000_000.0
        let metersPerLongitudeDegree = 111_320.0 * cos(51.0 * .pi / 180.0)
        let points = [0.0, 1.2, 2.4, 3.6].enumerated().map { index, meters in
            gpsPoint(
                time: start + Double(index),
                altitude: nil,
                longitude: 13.0 + meters / metersPerLongitudeDegree
            )
        }
        let distance = RideRouteMetrics.distanceMeters(for: points)
        expect(distance > 3.4 && distance < 3.8, "slow technical movement accumulates instead of being discarded")
    }

    private static func testMTBFastDescentIsPreserved() {
        let start = 1_700_000_000.0
        let metersPerLongitudeDegree = 111_320.0 * cos(51.0 * .pi / 180.0)
        let points = [
            gpsPoint(time: start, altitude: nil, longitude: 13.0),
            gpsPoint(time: start + 5, altitude: nil, longitude: 13.0 + 180.0 / metersPerLongitudeDegree)
        ]
        let distance = RideRouteMetrics.distanceMeters(for: points)
        expect(distance > 175 && distance < 185, "rapid downhill movement is not rejected by a fixed distance cap")

        let impossibleJump = [
            points[0],
            gpsPoint(time: start + 1, altitude: nil, longitude: 13.0 + 180.0 / metersPerLongitudeDegree)
        ]
        expect(RideRouteMetrics.distanceMeters(for: impossibleJump) == 0, "isolated one-second GPS teleport is rejected")
    }

    private static func testMTBAccuracyEnvelopeIsNotOverlyStrict() {
        let start = 1_700_000_000.0
        let metersPerLongitudeDegree = 111_320.0 * cos(51.0 * .pi / 180.0)
        let points = [
            gpsPoint(time: start, altitude: nil, longitude: 13.0, accuracy: 45),
            gpsPoint(time: start + 2, altitude: nil, longitude: 13.0 + 12.0 / metersPerLongitudeDegree, accuracy: 45)
        ]
        let distance = RideRouteMetrics.distanceMeters(for: points)
        expect(distance > 11 && distance < 13, "moderate tree-cover GPS accuracy remains usable")
    }

    private static func makeRide(
        gpsAltitudes: [Double],
        barometerAltitudes: [Double],
        offsetsInSeconds: [Double]
    ) -> Ride {
        let start = 1_700_000_000.0
        let gps = gpsAltitudes.enumerated().map { index, altitude in
            gpsPoint(time: start + Double(index * 10), altitude: altitude)
        }
        let barometer = zip(offsetsInSeconds, barometerAltitudes).map { offset, altitude in
            sample(time: start + offset, altitude: altitude)
        }
        return Ride(
            id: "validation-test",
            name: nil,
            startedAt: start,
            endedAt: nil,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: gps,
            barometerSamples: barometer,
            importedFromId: nil
        )
    }

    private static func gpsPoint(time: Double, altitude: Double?, longitude: Double = 13.0, accuracy: Double = 5) -> RidePoint {
        RidePoint(
            lat: 51.0,
            lon: longitude,
            t: time,
            alt: altitude,
            altAccuracy: altitude == nil ? nil : 5,
            altSource: altitude == nil ? nil : "coreLocation",
            pressureKPa: nil,
            accuracy: accuracy
        )
    }

    private static func sample(
        time: Double,
        altitude: Double,
        sessionID: UUID? = defaultSessionID
    ) -> BarometerSample {
        BarometerSample(
            pressureKPa: 100,
            relativeAltitudeM: altitude,
            timestampMs: Int64((time * 1_000).rounded()),
            sessionID: sessionID
        )
    }

    private static func close(_ value: Double?, to expected: Double) -> Bool {
        guard let value else { return false }
        return abs(value - expected) < 0.001
    }

    private static func expect(_ condition: Bool, _ label: String) {
        guard condition else {
            fputs("FAILED: \(label)\n", stderr)
            exit(1)
        }
    }
}
