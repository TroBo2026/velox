import Foundation

/// Core fields compatible with existing VELOX ride records.
/// Unknown JSON keys are retained so newer Web fields survive native round-trips.
struct Ride: Codable, Identifiable, Equatable {
    var id: String
    var name: String?
    var startedAt: Double
    var endedAt: Double?
    var pausedMs: Double?
    var pauseStarted: Double?
    var status: String
    var points: [RidePoint]
    var barometerSamples: [BarometerSample]?
    var watchSamples: [WatchSensorSample]?
    var importedFromId: String?
    var additionalFields: [String: JSONValue] = [:]

    enum CodingKeys: String, CodingKey {
        case id, name, startedAt, endedAt, pausedMs, pauseStarted
        case status, points, barometerSamples, watchSamples, importedFromId
    }
}

extension Ride {
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        startedAt = try container.decode(Double.self, forKey: .startedAt)
        endedAt = try container.decodeIfPresent(Double.self, forKey: .endedAt)
        pausedMs = try container.decodeIfPresent(Double.self, forKey: .pausedMs)
        pauseStarted = try container.decodeIfPresent(Double.self, forKey: .pauseStarted)
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "completed"
        points = try container.decodeIfPresent([RidePoint].self, forKey: .points) ?? []
        barometerSamples = try container.decodeIfPresent([BarometerSample].self, forKey: .barometerSamples)
        watchSamples = try container.decodeIfPresent([WatchSensorSample].self, forKey: .watchSamples)
        importedFromId = try container.decodeIfPresent(String.self, forKey: .importedFromId)

        let known = Set(CodingKeys.allCases.map(\.stringValue))
        let all = try decoder.container(keyedBy: DynamicCodingKey.self)
        var extras: [String: JSONValue] = [:]
        for key in all.allKeys where !known.contains(key.stringValue) {
            extras[key.stringValue] = try all.decode(JSONValue.self, forKey: key)
        }
        additionalFields = extras
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encode(startedAt, forKey: .startedAt)
        try container.encodeIfPresent(endedAt, forKey: .endedAt)
        try container.encodeIfPresent(pausedMs, forKey: .pausedMs)
        try container.encodeIfPresent(pauseStarted, forKey: .pauseStarted)
        try container.encode(status, forKey: .status)
        try container.encode(points, forKey: .points)
        try container.encodeIfPresent(barometerSamples, forKey: .barometerSamples)
        try container.encodeIfPresent(watchSamples, forKey: .watchSamples)
        try container.encodeIfPresent(importedFromId, forKey: .importedFromId)

        var all = encoder.container(keyedBy: DynamicCodingKey.self)
        let known = Set(CodingKeys.allCases.map(\.stringValue))
        for (key, value) in additionalFields where !known.contains(key) {
            try all.encode(value, forKey: DynamicCodingKey(stringValue: key)!)
        }
    }
}

private enum DynamicCodingKey: CodingKey {
    case string(String)
    case int(Int)
    init?(stringValue: String) { self = .string(stringValue) }
    init?(intValue: Int) { self = .int(intValue) }
    var stringValue: String {
        switch self { case .string(let value): return value; case .int(let value): return String(value) }
    }
    var intValue: Int? { if case .int(let value) = self { return value }; return nil }
}

extension Ride.CodingKeys: CaseIterable {}

/// JSON value tree used to preserve fields unknown to this version of VELOX.
enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let v = try? value.decode(Bool.self) { self = .bool(v) }
        else if let v = try? value.decode(Double.self) { self = .number(v) }
        else if let v = try? value.decode(String.self) { self = .string(v) }
        else if let v = try? value.decode([JSONValue].self) { self = .array(v) }
        else if let v = try? value.decode([String: JSONValue].self) { self = .object(v) }
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
