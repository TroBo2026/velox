import Foundation

@main
struct RideAnalysisValidation {
    static func main() {
        testEmptyRide()
        testStableGPSCalibration()
        testInsufficientAnchorsStayRelative()
        testUnstableAnchorsStayRelative()
        testGPSGapSplitsElevationTotals()
        testBarometerGapSplitsProfile()
        testMissingRouteIsUnavailable()
        testImplausibleGPSspeedSplitsRoute()
        testSlowGPSDriftDoesNotAddDistance()
        testSummaryDoesNotBridgeBarometerSessions()
        testCalibratorAnchorsWithinOneSession()
        testCalibratorRejectsCrossSessionBaseline()
        testCalibratorRejectsEarlierSample()
        testProfileMedianFilterPreservesRawSamples()
        print("VELOX elevation validation: 14/14 checks passed")
    }

    private static func testEmptyRide() {
        let result = RideElevationAnalysis(ride: nil)
        expect(result.reference == .unavailable, "nil ride reference")
        expect(result.profile.isEmpty && result.ascentM == 0 && result.descentM == 0, "nil ride values")
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
    }

    private static func testUnstableAnchorsStayRelative() {
        let ride = makeRide(
            gpsAltitudes: [100, 120, 140],
            barometerAltitudes: [0, 1, 2],
            offsetsInSeconds: [1, 11, 19]
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.reference == .barometerRelative, "unstable references do not calibrate")
        expect(result.calibrationOffsetM == nil, "unstable offset is not applied")
        expect((result.calibrationSpreadM ?? 0) > 10, "unstable spread is visible")
        expect(result.profile.map(\.altitudeM) == [0, 1, 2], "unstable offset is not applied to profile")
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
                gpsPoint(time: start + 10, altitude: nil),
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

    private static func testBarometerGapSplitsProfile() {
        let start = 1_700_000_000.0
        let gps = (0..<7).map { index in
            gpsPoint(time: start + Double(index * 10), altitude: nil)
        }
        let ride = Ride(
            id: "barometer-gap-test",
            name: nil,
            startedAt: start,
            endedAt: start + 60,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: gps,
            barometerSamples: [
                sample(time: start + 1, altitude: 0),
                sample(time: start + 9, altitude: 3),
                sample(time: start + 41, altitude: 50),
                sample(time: start + 49, altitude: 53)
            ],
            importedFromId: nil
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.profile.count == 4, "barometer samples remain plotted around sensor gap")
        expect(result.profile[1].segmentID != result.profile[2].segmentID, "stale barometer interval splits profile")
        expect(abs(result.ascentM - 6) < 0.001, "ascent excludes unobserved barometer gap")
        expect(abs(result.netChangeM) < 0.001, "net change is not joined across barometer gap")
    }

    private static func testMissingRouteIsUnavailable() {
        let start = 1_700_000_000.0
        let ride = Ride(
            id: "missing-route-test",
            name: nil,
            startedAt: start,
            endedAt: start + 2,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: [gpsPoint(time: start, altitude: nil)],
            barometerSamples: [sample(time: start + 1, altitude: 4)],
            importedFromId: nil
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.profile.isEmpty, "barometer without route cannot be plotted")
        expect(result.reference == .unavailable, "missing route is not labeled as relative profile")
    }

    private static func testImplausibleGPSspeedSplitsRoute() {
        let start = 1_700_000_000.0
        let first = gpsPoint(time: start, altitude: nil)
        let second = RidePoint(
            lat: 51.0009,
            lon: 13.0,
            t: start + 2,
            alt: nil,
            altAccuracy: nil,
            altSource: nil,
            pressureKPa: nil,
            accuracy: 5
        )
        let ride = Ride(
            id: "implausible-speed-test",
            name: nil,
            startedAt: start,
            endedAt: start + 2,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: [first, second],
            barometerSamples: [
                sample(time: start + 0.5, altitude: 0),
                sample(time: start + 1.5, altitude: 3)
            ],
            importedFromId: nil
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.profile.isEmpty, "implausible GPS speed cannot anchor an elevation segment")
        expect(result.reference == .unavailable, "rejected GPS route is not shown as relative profile")
    }

    private static func testSlowGPSDriftDoesNotAddDistance() {
        let start = 1_700_000_000.0
        let first = gpsPoint(time: start, altitude: nil)
        let second = RidePoint(
            lat: 51.000027,
            lon: 13.0,
            t: start + 10,
            alt: nil,
            altAccuracy: nil,
            altSource: nil,
            pressureKPa: nil,
            accuracy: 5
        )
        let ride = Ride(
            id: "slow-drift-test",
            name: nil,
            startedAt: start,
            endedAt: start + 10,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: [first, second],
            barometerSamples: [
                sample(time: start + 1, altitude: 0),
                sample(time: start + 9, altitude: 0.2)
            ],
            importedFromId: nil
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.profile.count == 2, "slow drift profile samples remain available")
        expect(abs(result.profile[1].distanceM - result.profile[0].distanceM) < 0.001,
               "sub-threshold GPS drift does not increase profile distance")
    }

    private static func testSummaryDoesNotBridgeBarometerSessions() {
        let start = 1_700_000_000.0
        let firstSession = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!
        let secondSession = UUID(uuidString: "BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF")!
        let samples = [
            sample(time: start + 1, altitude: 0),
            sample(time: start + 9, altitude: 3),
            BarometerSample(
                pressureKPa: 100,
                relativeAltitudeM: 0,
                timestampMs: Int64(((start + 11) * 1_000).rounded()),
                sessionID: secondSession
            ),
            BarometerSample(
                pressureKPa: 100,
                relativeAltitudeM: 4,
                timestampMs: Int64(((start + 19) * 1_000).rounded()),
                sessionID: secondSession
            )
        ]
        expect(samples[0].sessionID == firstSession, "first barometer session fixture")
        let summary = RideElevationSummary(samples: samples)
        expect(abs(summary.ascentM - 7) < 0.001, "summary accumulates ascent inside each sensor session")
        expect(abs(summary.descentM) < 0.001, "summary excludes false descent at session reset")
        expect(abs(summary.netChangeM) < 0.001, "summary does not calculate net change across sessions")
    }

    private static func testCalibratorAnchorsWithinOneSession() {
        let start = 1_700_000_000.0
        let baseline = sample(time: start + 1, altitude: 0)
        let later = sample(time: start + 2, altitude: 3)
        let reference = GPSAltitudeReference(
            altitudeM: 100,
            verticalAccuracyM: 5,
            timestampMs: Int64(((start + 1) * 1_000).rounded())
        )
        do {
            let result = try BarometerElevationCalibrator.calibrate(
                sample: later,
                baseline: baseline,
                against: reference
            )
            expect(close(result.altitudeM, to: 103), "same-session barometer altitude anchored to GPS")
        } catch {
            expect(false, "same-session calibration unexpectedly failed")
        }
    }

    private static func testCalibratorRejectsCrossSessionBaseline() {
        let start = 1_700_000_000.0
        let baseline = sample(time: start + 1, altitude: 0)
        let differentSession = BarometerSample(
            pressureKPa: 100,
            relativeAltitudeM: 3,
            timestampMs: Int64(((start + 2) * 1_000).rounded()),
            sessionID: UUID(uuidString: "BBBBBBBB-CCCC-DDDD-EEEE-FFFFFFFFFFFF")
        )
        let reference = GPSAltitudeReference(
            altitudeM: 100,
            verticalAccuracyM: 5,
            timestampMs: Int64(((start + 1) * 1_000).rounded())
        )
        var rejected = false
        do {
            _ = try BarometerElevationCalibrator.calibrate(
                sample: differentSession,
                baseline: baseline,
                against: reference
            )
        } catch BarometerElevationCalibrator.CalibrationError.differentBarometerSession {
            rejected = true
        } catch {}
        expect(rejected, "calibrator rejects baseline from another sensor session")
    }

    private static func testCalibratorRejectsEarlierSample() {
        let start = 1_700_000_000.0
        let baseline = sample(time: start + 2, altitude: 2)
        let earlier = sample(time: start + 1, altitude: 1)
        let reference = GPSAltitudeReference(
            altitudeM: 100,
            verticalAccuracyM: 5,
            timestampMs: Int64(((start + 2) * 1_000).rounded())
        )
        var rejected = false
        do {
            _ = try BarometerElevationCalibrator.calibrate(
                sample: earlier,
                baseline: baseline,
                against: reference
            )
        } catch BarometerElevationCalibrator.CalibrationError.samplePrecedesBaseline {
            rejected = true
        } catch {}
        expect(rejected, "calibrator rejects sample preceding its baseline")
    }

    private static func testProfileMedianFilterPreservesRawSamples() {
        let start = 1_700_000_000.0
        let altitudes: [Double] = [0, 1, 20, 3, 4, 5]
        let gps = (0..<6).map { index in
            gpsPoint(time: start + Double(index * 10), altitude: nil)
        }
        let samples = altitudes.enumerated().map { index, altitude in
            sample(time: start + Double(index * 10) + 1, altitude: altitude)
        }
        let ride = Ride(
            id: "profile-smoothing-test",
            name: nil,
            startedAt: start,
            endedAt: start + 60,
            pausedMs: 0,
            pauseStarted: nil,
            status: "completed",
            points: gps,
            barometerSamples: samples,
            importedFromId: nil
        )
        let result = RideElevationAnalysis(ride: ride)
        expect(result.profile.count == 6, "smoothed profile retains the sample count")
        expect(abs(result.profile[2].altitudeM - 3) < 0.001, "isolated barometer spike is median-filtered")
        expect(abs(result.profile[3].altitudeM - 4) < 0.001, "neighboring profile point remains robust")
        expect(result.rawBarometerCount == 6, "raw barometer count remains unchanged")
        expect(ride.barometerSamples?.map(\\.relativeAltitudeM) == altitudes, "archived raw barometer values remain untouched")
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

    private static func gpsPoint(time: Double, altitude: Double?) -> RidePoint {
        RidePoint(
            lat: 51.0,
            lon: 13.0,
            t: time,
            alt: altitude,
            altAccuracy: altitude == nil ? nil : 5,
            altSource: altitude == nil ? nil : "coreLocation",
            pressureKPa: nil,
            accuracy: 5
        )
    }

    private static func sample(time: Double, altitude: Double) -> BarometerSample {
        BarometerSample(
            pressureKPa: 100,
            relativeAltitudeM: altitude,
            timestampMs: Int64((time * 1_000).rounded()),
            sessionID: UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")
        )
    }

    private static func close(_ value: Double?, to expected: Double) -> Bool {
        guard let value else { return false }
        return abs(value - expected) < 0.001
    }

    private static func expect(_ condition: Bool, _ label: String) {
        guard condition else {
            fputs("FAILED: \(label)\\n", stderr)
            exit(1)
        }
    }
}
