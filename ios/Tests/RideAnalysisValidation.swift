import Foundation

@main
struct RideAnalysisValidation {
    static func main() {
        testEmptyRide()
        testStableGPSCalibration()
        testInsufficientAnchorsStayRelative()
        testUnstableAnchorsStayRelative()
        testGPSGapSplitsElevationTotals()
        print("VELOX elevation validation: 5/5 checks passed")
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
