import Foundation

/// A validated, timestamped observation delivered by the VELOX watchOS companion.
/// The phone stores these samples separately from GPS and barometer observations.
struct WatchSensorSample: Codable, Equatable, Identifiable {
    enum Kind: String, Codable, CaseIterable {
        case heartRateBPM
        case relativeAltitudeM
        case speedMetersPerSecond
        case cadenceRPM
        case activeEnergyKcal
        case distanceMeters
        case stepCount

        var unit: String {
            switch self {
            case .heartRateBPM: return "bpm"
            case .relativeAltitudeM: return "m"
            case .speedMetersPerSecond: return "m/s"
            case .cadenceRPM: return "rpm"
            case .activeEnergyKcal: return "kcal"
            case .distanceMeters: return "m"
            case .stepCount: return "count"
            }
        }
    }

    enum Source: String, Codable {
        case healthKit
        case coreMotion
        case coreLocation
    }

    let id: String
    let rideID: String
    let kind: Kind
    let timestampMs: Int64
    let value: Double
    let source: Source

    init?(payload: [String: Any]) {
        guard
            (payload["schemaVersion"] as? Int) == 1,
            let id = payload["id"] as? String, !id.isEmpty, id.count <= 128,
            let rideID = payload["rideID"] as? String, !rideID.isEmpty, rideID.count <= 128,
            let kindRaw = payload["kind"] as? String,
            let kind = Kind(rawValue: kindRaw),
            let timestampNumber = payload["timestampMs"] as? NSNumber,
            let sourceRaw = payload["source"] as? String,
            let source = Source(rawValue: sourceRaw),
            let valueNumber = payload["value"] as? NSNumber
        else { return nil }

        let timestamp = timestampNumber.int64Value
        let value = valueNumber.doubleValue
        guard timestamp > 0, value.isFinite, Self.isValid(value, for: kind, source: source) else {
            return nil
        }

        self.id = id
        self.rideID = rideID
        self.kind = kind
        self.timestampMs = timestamp
        self.value = value
        self.source = source
    }

    /// Dictionary representation used by WCSession.transferUserInfo.
    var transferPayload: [String: Any] {
        [
            "schemaVersion": 1,
            "id": id,
            "rideID": rideID,
            "kind": kind.rawValue,
            "timestampMs": timestampMs,
            "value": value,
            "source": source.rawValue
        ]
    }

    private static func isValid(_ value: Double, for kind: Kind, source: Source) -> Bool {
        let sourceIsAllowed: Bool
        switch kind {
        case .heartRateBPM, .cadenceRPM, .activeEnergyKcal, .stepCount:
            sourceIsAllowed = source == .healthKit
        case .relativeAltitudeM:
            sourceIsAllowed = source == .coreMotion
        case .speedMetersPerSecond, .distanceMeters:
            sourceIsAllowed = source == .healthKit || source == .coreLocation
        }
        guard sourceIsAllowed else { return false }

        switch kind {
        case .heartRateBPM: return (25...240).contains(value)
        case .relativeAltitudeM: return (-1_000...10_000).contains(value)
        case .speedMetersPerSecond: return (0...35).contains(value)
        case .cadenceRPM: return (0...240).contains(value)
        case .activeEnergyKcal: return (0...10_000).contains(value)
        case .distanceMeters: return (0...1_000_000).contains(value)
        case .stepCount: return (0...200_000).contains(value) && value.rounded() == value
        }
    }
}
