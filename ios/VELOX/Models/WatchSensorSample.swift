import Foundation

/// A validated, timestamped observation delivered by the VELOX watchOS companion.
/// The phone stores these samples separately from GPS and barometer observations.
struct WatchSensorSample: Codable, Equatable, Identifiable {
    enum Kind: String, Codable, CaseIterable {
        case heartRateBPM
        case relativeAltitudeM
        case speedMetersPerSecond
        case cadenceRPM
        case cyclingPowerWatts
        case activeEnergyKcal
        case distanceMeters
        case stepCount

        var unit: String {
            switch self {
            case .heartRateBPM: return "bpm"
            case .relativeAltitudeM: return "m"
            case .speedMetersPerSecond: return "m/s"
            case .cadenceRPM: return "rpm"
            case .cyclingPowerWatts: return "W"
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
    var rideID: String
    let kind: Kind
    let timestampMs: Int64
    let value: Double
    let source: Source
    /// Unknown future JSON fields survive stored backup round-trips.
    private var additionalFields: [String: WatchJSONValue] = [:]

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
        self.additionalFields = [:]
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, rideID, kind, timestampMs, value, source
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        rideID = try c.decode(String.self, forKey: .rideID)
        kind = try c.decode(Kind.self, forKey: .kind)
        timestampMs = try c.decode(Int64.self, forKey: .timestampMs)
        value = try c.decode(Double.self, forKey: .value)
        source = try c.decode(Source.self, forKey: .source)
        let known = Set(CodingKeys.allCases.map(\.stringValue))
        let all = try decoder.container(keyedBy: WatchDynamicCodingKey.self)
        var extras: [String: WatchJSONValue] = [:]
        for key in all.allKeys where !known.contains(key.stringValue) {
            extras[key.stringValue] = try all.decode(WatchJSONValue.self, forKey: key)
        }
        additionalFields = extras
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(rideID, forKey: .rideID)
        try c.encode(kind, forKey: .kind)
        try c.encode(timestampMs, forKey: .timestampMs)
        try c.encode(value, forKey: .value)
        try c.encode(source, forKey: .source)
        var all = encoder.container(keyedBy: WatchDynamicCodingKey.self)
        let known = Set(CodingKeys.allCases.map(\.stringValue))
        for (key, value) in additionalFields where !known.contains(key) {
            try all.encode(value, forKey: WatchDynamicCodingKey(stringValue: key)!)
        }
    }

    func isValidObservation() -> Bool {
        !id.isEmpty && id.count <= 128 &&
        !rideID.isEmpty && rideID.count <= 128 &&
        timestampMs > 0 && value.isFinite &&
        Self.isValid(value, for: kind, source: source)
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
        case .heartRateBPM, .cadenceRPM, .cyclingPowerWatts, .activeEnergyKcal, .stepCount:
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
        case .cyclingPowerWatts: return (0...2_500).contains(value)
        case .activeEnergyKcal: return (0...10_000).contains(value)
        case .distanceMeters: return (0...1_000_000).contains(value)
        case .stepCount: return (0...200_000).contains(value) && value.rounded() == value
        }
    }
}



private enum WatchJSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([WatchJSONValue])
    case object([String: WatchJSONValue])

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let v = try? value.decode(Bool.self) { self = .bool(v) }
        else if let v = try? value.decode(Double.self) { self = .number(v) }
        else if let v = try? value.decode(String.self) { self = .string(v) }
        else if let v = try? value.decode([WatchJSONValue].self) { self = .array(v) }
        else if let v = try? value.decode([String: WatchJSONValue].self) { self = .object(v) }
        else { throw DecodingError.dataCorruptedError(in: value, debugDescription: "Unsupported JSON value") }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .null: try value.encodeNil()
        case .bool(let v): try value.encode(v)
        case .number(let v): try value.encode(v)
        case .string(let v): try value.encode(v)
        case .array(let v): try value.encode(v)
        case .object(let v): try value.encode(v)
        }
    }
}


private enum WatchDynamicCodingKey: CodingKey {
    case string(String)
    case int(Int)
    init?(stringValue: String) { self = .string(stringValue) }
    init?(intValue: Int) { self = .int(intValue) }
    var stringValue: String {
        switch self { case .string(let value): return value; case .int(let value): return String(value) }
    }
    var intValue: Int? { if case .int(let value) = self { return value }; return nil }
}

/// A user-initiated Watch control action for the active iPhone ride.
struct WatchRideCommand: Equatable {
    enum Action: String {
        case pause
        case resume
        case stop
    }

    let id: String
    let rideID: String
    let action: Action
    let timestampMs: Int64

    init?(payload: [String: Any]) {
        guard
            (payload["schemaVersion"] as? Int) == 1,
            (payload["messageType"] as? String) == "rideCommand",
            let id = payload["id"] as? String, !id.isEmpty, id.count <= 128,
            let rideID = payload["rideID"] as? String, !rideID.isEmpty, rideID.count <= 128,
            let actionRaw = payload["action"] as? String,
            let action = Action(rawValue: actionRaw),
            let timestamp = payload["timestampMs"] as? NSNumber
        else { return nil }
        let milliseconds = timestamp.int64Value
        guard milliseconds > 0 else { return nil }
        self.id = id
        self.rideID = rideID
        self.action = action
        self.timestampMs = milliseconds
    }
}
