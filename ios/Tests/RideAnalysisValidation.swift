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
        testBarometerGapSplitsProfileAndTotals()
        testPauseResumeSessionsCalibrateIndependently()
        testElevationOutlierAndRawDataIntegrity()
        testCompatibilitySummarySeparatesSessionsAndOutliers()
        testSharedRouteDistanceDoesNotBridgeGPSGaps()
        testMTBSlowTechnicalMovementIsAccumulated()
        testMTBFastDescentIsPreserved()
        testMTBAccuracyEnvelopeIsNotOverlyStrict()
        testCalibratorRejectsCrossSessionAndOutOfOrderSamples()
        testPerformanceAnalysisUsesAcceptedGPSIntervals()
        testPerformanceAnalysisAggregatesWatchSamples()
        testPerformanceAnalysisLeavesMissingSensorsUnavailable()
        testPauseIntervalsExcludeShortGPSBridges()
        print("VELOX elevation, route-distance and performance validation: 19 checks passed")
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
            gpsPoint(time: start + 10, altitude: nil, longitude: 13.0001),
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
                gpsPoint(time: start + 70, altitude: nil, longitude: 13.0010),
                gpsPoint(time: start + 80, altitude: nil, longitude: 13.0011)
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

    private static func testBarometerGapSplitsProfileAndTotals() {
        let start = 1_700_000_000.0
        let session = UUID(uuidString: "55555555-5555-5555-5555-555555555555")!
        let ride = Ride(
            id: "barometer-gap-test", name: nil, startedAt: start, endedAt: nil,
            pausedMs: 0, pauseStarted: nil, status: "completed",
            // Keep the final GPS fix after the last barometer sample so every sample can be projected.
            points: [0.0, 10, 40, 52].enumerated().map { index, offset in
                gpsPoint(time: start + offset, altitude: nil, longitude: 13.0 + Double(index) * 0.0001)
            },
            barometerSamples: [
                sample(time: start + 1, altitude: 0, sessionID: session),
                sample(time: start + 11, altitude: 2, sessionID: session),
                sample(time: start + 41, altitude: 10, sessionID: session),
                sample(time: start + 51, altitude: 11, sessionID: session)
            ], importedFromId: nil
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.profile.count == 4, "all samples remain plotted")
        expect(result.profile[1].segmentID != result.profile[2].segmentID, "15-second barometer gap splits profile")
        expect(abs(result.ascentM - 3) < 0.001, "profile ascent excludes gap but counts both continuous segments")
        expect(abs(result.netChangeM) < 0.001, "net change is undefined across separated segments")
        let summary = RideElevationSummary(samples: ride.barometerSamples ?? [])
        expect(abs(summary.ascentM - 3) < 0.001, "compatibility summary uses the same gap policy")
        expect(abs(summary.descentM) < 0.001, "summary excludes gap-induced descent")
    }

    private static func testCalibratorRejectsCrossSessionAndOutOfOrderSamples() {
        let firstSession = UUID(uuidString: "66666666-6666-6666-6666-666666666666")!
        let secondSession = UUID(uuidString: "77777777-7777-7777-7777-777777777777")!
        let baseline = sample(time: 1_700_000_000, altitude: 0, sessionID: firstSession)
        let reference = GPSAltitudeReference(altitudeM: 100, verticalAccuracyM: 3, timestampMs: baseline.timestampMs)
        let sameSession = sample(time: 1_700_000_005, altitude: 5, sessionID: firstSession)
        let calibrated = try? BarometerElevationCalibrator.calibrate(sample: sameSession, baseline: baseline, against: reference)
        expect(close(calibrated?.altitudeM, to: 105), "same-session chronological calibration succeeds")
        let crossSession = sample(time: 1_700_000_005, altitude: 5, sessionID: secondSession)
        expect((try? BarometerElevationCalibrator.calibrate(sample: crossSession, baseline: baseline, against: reference)) == nil,
               "cross-session sample is rejected")
        let outOfOrder = sample(time: 1_699_999_999, altitude: -1, sessionID: firstSession)
        expect((try? BarometerElevationCalibrator.calibrate(sample: outOfOrder, baseline: baseline, against: reference)) == nil,
               "sample before baseline is rejected")
        let stale = sample(time: 1_700_000_020, altitude: 20, sessionID: firstSession)
        expect((try? BarometerElevationCalibrator.calibrate(sample: stale, baseline: baseline, against: reference)) == nil,
               "baseline older than 15 seconds is rejected")
    }

    private static func testPauseResumeSessionsCalibrateIndependently() {
        let start = 1_700_000_000.0
        let firstSession = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
        let secondSession = UUID(uuidString: "22222222-2222-2222-2222-222222222222")!
        let gpsTimes = [0.0, 10, 20, 100, 110, 120]
        let gpsAltitudes = [100.0, 101, 102, 200, 201, 202]
        let gps = zip(gpsTimes, gpsAltitudes).enumerated().map { index, pair in
            gpsPoint(time: start + pair.0, altitude: pair.1, longitude: 13.0 + Double(index) * 0.0001)
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

    private static func testPerformanceAnalysisUsesAcceptedGPSIntervals() {
        let start = 1_700_000_000.0
        let metersPerLongitudeDegree = 111_320.0 * cos(51.0 * .pi / 180.0)
        let points = [0.0, 100, 200].enumerated().map { index, meters in
            gpsPoint(
                time: start + Double(index * 10),
                altitude: nil,
                longitude: 13.0 + meters / metersPerLongitudeDegree
            )
        }
        let ride = Ride(
            id: "performance-gps",
            name: nil,
            startedAt: start,
            endedAt: start + 35,
            pausedMs: 5_000,
            pauseStarted: nil,
            status: "completed",
            points: points,
            barometerSamples: [],
            importedFromId: nil
        )
        let result = RidePerformanceAnalysis(ride: ride)
        expect(result.gpsDistanceMeters > 195 && result.gpsDistanceMeters < 205, "performance distance uses shared accepted GPS intervals")
        expect(close(result.elapsedSeconds, to: 30), "elapsed duration subtracts recorded pauses")
        expect(close(result.movingSeconds, to: 20), "moving time sums accepted GPS intervals only")
        expect((result.averageSpeedMetersPerSecond ?? 0) > 9.8 && (result.averageSpeedMetersPerSecond ?? 0) < 10.2, "average speed uses accepted distance and moving time")
        expect((result.maximumSpeedMetersPerSecond ?? 0) > 9.8 && (result.maximumSpeedMetersPerSecond ?? 0) < 10.2, "maximum speed uses accepted GPS segment speed")
        expect(result.gpsSegmentCount == 2, "accepted GPS interval count is exposed")

        let gapPoints = [0.0, 10, 70, 80].enumerated().map { index, offset in
            gpsPoint(
                time: start + offset,
                altitude: nil,
                longitude: 13.0 + Double(index) * 100 / metersPerLongitudeDegree
            )
        }
        var gapRide = ride
        gapRide.points = gapPoints
        gapRide.endedAt = start + 90
        gapRide.pausedMs = 0
        let gapResult = RidePerformanceAnalysis(ride: gapRide)
        expect(gapResult.gpsSegmentCount == 2, "long GPS gap is excluded from performance intervals")
        expect(close(gapResult.movingSeconds, to: 20), "long GPS gap does not inflate moving time")
    }

    private static func testPerformanceAnalysisAggregatesWatchSamples() {
        let start = 1_700_000_000.0
        let rideID = "performance-watch"
        let samples = [
            watchSample(rideID: rideID, kind: .heartRateBPM, value: 120, time: start + 1, id: "hr-1"),
            watchSample(rideID: rideID, kind: .heartRateBPM, value: 140, time: start + 3, id: "hr-2"),
            watchSample(rideID: rideID, kind: .heartRateBPM, value: 130, time: start + 5, id: "hr-3"),
            watchSample(rideID: rideID, kind: .cadenceRPM, value: 80, time: start + 2, id: "cad-1"),
            watchSample(rideID: rideID, kind: .cadenceRPM, value: 90, time: start + 4, id: "cad-2"),
            watchSample(rideID: rideID, kind: .cyclingPowerWatts, value: 200, time: start + 2, id: "power-1"),
            watchSample(rideID: rideID, kind: .cyclingPowerWatts, value: 300, time: start + 4, id: "power-2"),
            watchSample(rideID: rideID, kind: .speedMetersPerSecond, value: 5, time: start + 2, id: "speed-1"),
            watchSample(rideID: rideID, kind: .speedMetersPerSecond, value: 7, time: start + 4, id: "speed-2"),
            watchSample(rideID: rideID, kind: .activeEnergyKcal, value: 2, time: start + 2, id: "energy-1"),
            watchSample(rideID: rideID, kind: .activeEnergyKcal, value: 5, time: start + 5, id: "energy-2"),
            watchSample(rideID: rideID, kind: .distanceMeters, value: 1_000, time: start + 2, id: "watch-distance-1"),
            watchSample(rideID: rideID, kind: .distanceMeters, value: 1_500, time: start + 5, id: "watch-distance-2"),
            watchSample(rideID: "another-ride", kind: .heartRateBPM, value: 200, time: start + 6, id: "other-ride-hr")
        ]
        let ride = Ride(
            id: rideID,
            name: nil,
            startedAt: start,
            endedAt: start + 60,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: [],
            barometerSamples: [],
            watchSamples: samples,
            importedFromId: nil
        )
        let result = RidePerformanceAnalysis(ride: ride)
        expect(result.watchSampleCount == 13, "Watch metrics exclude samples from other rides")
        expect(close(result.averageHeartRateBPM, to: 130), "heart-rate average uses recorded samples")
        expect(close(result.maximumHeartRateBPM, to: 140), "maximum heart rate uses recorded samples")
        expect(close(result.averageCadenceRPM, to: 85), "cadence average uses recorded samples")
        expect(close(result.maximumCadenceRPM, to: 90), "maximum cadence uses recorded samples")
        expect(close(result.averagePowerWatts, to: 250), "power average uses recorded samples")
        expect(close(result.maximumPowerWatts, to: 300), "maximum power uses recorded samples")
        expect(close(result.averageWatchSpeedMetersPerSecond, to: 6), "Watch speed average remains distinct from GPS speed")
        expect(close(result.maximumWatchSpeedMetersPerSecond, to: 7), "Watch maximum speed remains distinct from GPS speed")
        expect(close(result.activeEnergyKcal, to: 5), "cumulative active energy uses latest HealthKit snapshot")
        expect(close(result.watchDistanceMeters, to: 1_500), "cumulative Watch distance uses latest HealthKit snapshot")
    }

    private static func testPerformanceAnalysisLeavesMissingSensorsUnavailable() {
        let start = 1_700_000_000.0
        let ride = Ride(
            id: "performance-no-sensors",
            name: nil,
            startedAt: start,
            endedAt: start + 60,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: [gpsPoint(time: start, altitude: nil)],
            barometerSamples: [],
            watchSamples: [],
            importedFromId: nil
        )
        let result = RidePerformanceAnalysis(ride: ride)
        expect(result.gpsDistanceMeters == 0, "single GPS point does not fabricate distance")
        expect(result.averageSpeedMetersPerSecond == nil, "average speed is unavailable without accepted intervals")
        expect(result.maximumSpeedMetersPerSecond == nil, "maximum speed is unavailable without accepted intervals")
        expect(result.averageHeartRateBPM == nil && result.maximumHeartRateBPM == nil, "missing heart rate remains unavailable")
        expect(result.averagePowerWatts == nil && result.averageCadenceRPM == nil, "missing power and cadence remain unavailable")
        expect(result.activeEnergyKcal == nil && result.watchDistanceMeters == nil, "missing cumulative Watch metrics remain unavailable")
    }

    private static func watchSample(
        rideID: String,
        kind: WatchSensorSample.Kind,
        value: Double,
        time: Double,
        id: String
    ) -> WatchSensorSample {
        let payload: [String: Any] = [
            "schemaVersion": 1,
            "id": id,
            "rideID": rideID,
            "kind": kind.rawValue,
            "timestampMs": Int64((time * 1_000).rounded()),
            "value": value,
            "source": "healthKit"
        ]
        guard let sample = WatchSensorSample(payload: payload) else {
            fatalError("Failed to create Watch validation sample")
        }
        return sample
    }

    private static func testPauseIntervalsExcludeShortGPSBridges() {
        let start = 1_700_000_000.0
        let metersPerLongitudeDegree = 111_320.0 * cos(51.0 * .pi / 180.0)
        let points = [
            gpsPoint(time: start, altitude: nil, longitude: 13.0),
            gpsPoint(time: start + 10, altitude: nil, longitude: 13.0 + 100 / metersPerLongitudeDegree)
        ]
        var ride = Ride(
            id: "short-pause",
            name: nil,
            startedAt: start,
            endedAt: start + 10,
            pausedMs: 2_000,
            pauseStarted: nil,
            status: "completed",
            points: points,
            barometerSamples: [],
            importedFromId: nil
        )
        RidePauseIntervals.begin(&ride, at: start + 4)
        expect(RidePauseIntervals.intervals(in: ride).count == 1, "pause start is stored in compatible metadata")
        expect(RidePauseIntervals.intervals(in: ride)[0].endedAtSeconds == nil, "open pause remains open until resume")
        RidePauseIntervals.end(&ride, at: start + 6)
        let interval = RidePauseIntervals.intervals(in: ride).first
        expect(close(interval?.startedAtSeconds, to: start + 4), "pause start round-trips from milliseconds")
        expect(close(interval?.endedAtSeconds, to: start + 6), "pause end round-trips from milliseconds")

        let result = RidePerformanceAnalysis(ride: ride)
        expect(result.gpsDistanceMeters == 0, "GPS interval crossing a short pause is not counted")
        expect(result.movingSeconds == 0, "GPS interval crossing a short pause does not inflate moving time")

        let segmentedPoints = [
            gpsPoint(time: start, altitude: nil, longitude: 13.0),
            gpsPoint(time: start + 3, altitude: nil, longitude: 13.0 + 30 / metersPerLongitudeDegree),
            gpsPoint(time: start + 7, altitude: nil, longitude: 13.0 + 35 / metersPerLongitudeDegree),
            gpsPoint(time: start + 10, altitude: nil, longitude: 13.0 + 60 / metersPerLongitudeDegree)
        ]
        var segmentedRide = ride
        segmentedRide.points = segmentedPoints
        let segmented = RidePerformanceAnalysis(ride: segmentedRide)
        expect(segmented.gpsDistanceMeters > 50 && segmented.gpsDistanceMeters < 60, "GPS intervals before and after pause remain countable")
        expect(close(segmented.movingSeconds, to: 6), "moving time excludes the paused interval")
    }

    private static func makeRide(
        gpsAltitudes: [Double],
        barometerAltitudes: [Double],
        offsetsInSeconds: [Double]
    ) -> Ride {
        let start = 1_700_000_000.0
        let gps = gpsAltitudes.enumerated().map { index, altitude in
            gpsPoint(time: start + Double(index * 10), altitude: altitude, longitude: 13.0 + Double(index) * 0.0001)
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
