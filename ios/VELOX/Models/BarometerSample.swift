import Foundation

/// A real barometer observation from Core Motion.
/// relativeAltitudeM is relative to the start of the current Core Motion session,
/// not an absolute elevation above sea level.
struct BarometerSample: Codable, Identifiable, Equatable {
    let id: UUID
    let pressureKPa: Double
    let relativeAltitudeM: Double
    let timestampMs: Int64
    let source: String
    let accuracyM: Double?
    /// Identifies a Core Motion session; nil keeps older JSON records decodable.
    let sessionID: UUID?
    /// Unknown future JSON fields survive import/export round-trips.
    var additionalFields: [String: JSONValue] = [:]

    init(
        id: UUID = UUID(),
        pressureKPa: Double,
        relativeAltitudeM: Double,
        timestampMs: Int64,
        source: String = "coreMotionBarometer",
        accuracyM: Double? = nil,
        sessionID: UUID? = nil
    ) {
        self.id = id
        self.pressureKPa = pressureKPa
        self.relativeAltitudeM = relativeAltitudeM
        self.timestampMs = timestampMs
        self.source = source
        self.accuracyM = accuracyM
        self.sessionID = sessionID
        self.additionalFields = [:]
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, pressureKPa, relativeAltitudeM, timestampMs, source, accuracyM, sessionID
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        pressureKPa = try c.decode(Double.self, forKey: .pressureKPa)
        relativeAltitudeM = try c.decode(Double.self, forKey: .relativeAltitudeM)
        timestampMs = try c.decode(Int64.self, forKey: .timestampMs)
        source = try c.decode(String.self, forKey: .source)
        accuracyM = try c.decodeIfPresent(Double.self, forKey: .accuracyM)
        sessionID = try c.decodeIfPresent(UUID.self, forKey: .sessionID)

        let known = Set(CodingKeys.allCases.map(\\.stringValue))
        let all = try decoder.container(keyedBy: BarometerDynamicCodingKey.self)
        var extras: [String: JSONValue] = [:]
        for key in all.allKeys where !known.contains(key.stringValue) {
            extras[key.stringValue] = try all.decode(JSONValue.self, forKey: key)
        }
        additionalFields = extras
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(pressureKPa, forKey: .pressureKPa)
        try c.encode(relativeAltitudeM, forKey: .relativeAltitudeM)
        try c.encode(timestampMs, forKey: .timestampMs)
        try c.encode(source, forKey: .source)
        try c.encodeIfPresent(accuracyM, forKey: .accuracyM)
        try c.encodeIfPresent(sessionID, forKey: .sessionID)

        var all = encoder.container(keyedBy: BarometerDynamicCodingKey.self)
        let known = Set(CodingKeys.allCases.map(\\.stringValue))
        for (key, value) in additionalFields where !known.contains(key) {
            try all.encode(value, forKey: BarometerDynamicCodingKey(stringValue: key)!)
        }
    }
}

private enum BarometerDynamicCodingKey: CodingKey {
    case string(String)
    case int(Int)
    init?(stringValue: String) { self = .string(stringValue) }
    init?(intValue: Int) { self = .int(intValue) }
    var stringValue: String {
        switch self { case .string(let value): return value; case .int(let value): return String(value) }
    }
    var intValue: Int? { if case .int(let value) = self { return value }; return nil }
}
