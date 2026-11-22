import Foundation

@main
struct RideBackupCodecValidation {
    static func main() throws {
        let fixture = """
        {
          "app":"VELOX","version":1,"exportedAt":"2026-11-20T12:00:00Z",
          "rides":[{
            "id":"web-ride-1","startedAt":1795000000000,"endedAt":1795003600000,
            "pausedMs":12000,"pauseStarted":1795002000000,"status":"completed","name":"MTB",
            "points":[{"lat":51.0,"lon":13.0,"t":1795000000000,"alt":250,"accuracy":5,"speed":7.2,"futurePointField":{"quality":"good"}}],
            "barometerSamples":[{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","pressureKPa":100,"relativeAltitudeM":2,"timestampMs":1795000003000,"source":"coreMotionBarometer","sessionID":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","futureBarometerField":{"sensorRevision":2}}],
            "watchSamples":[{"id":"watch-sample-1","rideID":"web-ride-1","kind":"heartRateBPM","timestampMs":1795000005000,"value":120,"source":"healthKit","futureWatchField":{"quality":"verified"}}],
            "pauseIntervals":[{"startedAt":1795001000000,"endedAt":1795001012000}],
            "weather":{"temperatureC":12,"condition":"cloudy"},
            "futureRideField":[1,true,null,{"x":"y"}]
          }]
        }
        """
        let imported = try RideBackupCodec.importBackup(from: Data(fixture.utf8), existingIDs: [])
        expect(imported.rides.count == 1, "one web ride imported")
        let nativeRide = imported.rides[0]
        expect(abs(nativeRide.startedAt - 1_795_000_000) < 0.001, "PWA start milliseconds convert to native seconds")
        expect(abs((nativeRide.endedAt ?? 0) - 1_795_003_600) < 0.001, "PWA end milliseconds convert to native seconds")
        expect(abs((nativeRide.pauseStarted ?? 0) - 1_795_002_000) < 0.001, "PWA pause timestamp converts to native seconds")
        expect(nativeRide.watchSamples?.first?.isValidObservation() == true, "real PWA Watch sample validates against converted ride times")
        let exported = try RideBackupCodec.exportBackup(rides: imported.rides, exportedAt: Date(timeIntervalSince1970: 1_795_000_000))
        let root = try JSONSerialization.jsonObject(with: exported) as! [String: Any]
        let rides = root["rides"] as! [[String: Any]]
        let ride = rides[0]
        expect((ride["startedAt"] as? NSNumber)?.doubleValue == 1_795_000_000_000, "native start exports as PWA milliseconds")
        expect((ride["endedAt"] as? NSNumber)?.doubleValue == 1_795_003_600_000, "native end exports as PWA milliseconds")
        expect((ride["pauseStarted"] as? NSNumber)?.doubleValue == 1_795_002_000_000, "native pause timestamp exports as PWA milliseconds")
        expect(ride["weather"] != nil, "weather preserved")
        expect(ride["pauseIntervals"] != nil, "pause intervals preserved")
        expect(ride["futureRideField"] != nil, "unknown top-level fields preserved")
        let points = ride["points"] as! [[String: Any]]
        expect((points[0]["speed"] as? NSNumber)?.doubleValue == 7.2, "GPS speed preserved")
        expect(points[0]["futurePointField"] != nil, "unknown GPS point fields preserved")
        let barometer = (ride["barometerSamples"] as! [[String: Any]])[0]
        expect(barometer["futureBarometerField"] != nil, "unknown barometer fields preserved")
        let watch = (ride["watchSamples"] as! [[String: Any]])[0]
        expect(watch["futureWatchField"] != nil, "unknown Watch fields preserved")
        expect((watch["rideID"] as? String) == "web-ride-1", "Watch ride ID stays linked after round-trip")
        let roundTrip = try RideBackupCodec.importBackup(from: exported, existingIDs: [])
        expect(roundTrip.rides[0].additionalFields == imported.rides[0].additionalFields, "unknown ride values stable after second decode")
        expect(roundTrip.rides[0].points[0].additionalFields == imported.rides[0].points[0].additionalFields, "unknown point values stable after second decode")
        let originalBarometerFields = imported.rides[0].barometerSamples?.first?.additionalFields
        let roundTripBarometerFields = roundTrip.rides[0].barometerSamples?.first?.additionalFields
        expect(roundTripBarometerFields == originalBarometerFields, "unknown barometer values stable after second decode")
        let originalWatch = try JSONEncoder().encode(imported.rides[0].watchSamples?.first)
        let roundTripWatch = try JSONEncoder().encode(roundTrip.rides[0].watchSamples?.first)
        let originalWatchObject = try JSONSerialization.jsonObject(with: originalWatch) as? [String: Any]
        let roundTripWatchObject = try JSONSerialization.jsonObject(with: roundTripWatch) as? [String: Any]
        expect(originalWatchObject?["futureWatchField"] != nil && roundTripWatchObject?["futureWatchField"] != nil, "unknown Watch values stable after second decode")

        let duplicate = try RideBackupCodec.importBackup(from: Data(fixture.utf8), existingIDs: ["web-ride-1"])
        expect(duplicate.remappedIDCount == 1, "colliding ID remapped")
        expect(duplicate.rides[0].additionalFields["weather"] != nil, "unknown data retained after ID remap")
        expect(duplicate.rides[0].watchSamples?.first?.rideID == duplicate.rides[0].id, "Watch ride ID remapped with colliding ride")
        print("VELOX JSON-v1 lossless round-trip validation: 23/23 checks passed")
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError("FAILED: " + message) }
    }
}
