import Foundation

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }
}

let valid: [String: Any] = [
    "schemaVersion": 1,
    "id": "watch-sample-001",
    "rideID": "ride-001",
    "kind": "heartRateBPM",
    "timestampMs": Int64(1_800_000_000_000),
    "value": 142.0,
    "source": "healthKit"
]
let sample = WatchSensorSample(payload: valid)
expect(sample != nil, "valid HealthKit heart-rate sample is accepted")
expect(sample?.kind == .heartRateBPM, "sample kind is preserved")
expect(sample?.timestampMs == 1_800_000_000_000, "original timestamp is preserved")
expect(sample?.transferPayload["rideID"] as? String == "ride-001", "ride ID is preserved in transfer payload")

var missingTimestamp = valid
missingTimestamp.removeValue(forKey: "timestampMs")
expect(WatchSensorSample(payload: missingTimestamp) == nil, "missing timestamp is rejected")

var invalidRange = valid
invalidRange["value"] = 300.0
expect(WatchSensorSample(payload: invalidRange) == nil, "out-of-range heart rate is rejected")

var wrongSource = valid
wrongSource["source"] = "coreMotion"
expect(WatchSensorSample(payload: wrongSource) == nil, "heart rate from a non-HealthKit source is rejected")

var unknownKind = valid
unknownKind["kind"] = "madeUpSensor"
expect(WatchSensorSample(payload: unknownKind) == nil, "unknown sensor kind is rejected")

var wrongVersion = valid
wrongVersion["schemaVersion"] = 2
expect(WatchSensorSample(payload: wrongVersion) == nil, "unsupported packet version is rejected")

var nonFinite = valid
nonFinite["value"] = Double.nan
expect(WatchSensorSample(payload: nonFinite) == nil, "non-finite sensor value is rejected")

print("Watch sensor validation: 7/7 checks passed")
