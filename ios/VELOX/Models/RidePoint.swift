import Foundation

/// GPS point using the same key names as existing VELOX JSON-v1.
/// Additional fields (for example speed and future sensor metadata) survive round-trips.
struct RidePoint: Codable, Equatable {
    let lat: Double
    let lon: Double
    let t: Double
    var alt: Double?
    var altAccuracy: Double?
    var altSource: String?
    var pressureKPa: Double?
    var accuracy: Double?
    var additionalFields: [String: JSONValue] = [:]

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case lat, lon, t, alt, altAccuracy, altSource, pressureKPa, accuracy
    }
}

extension RidePoint {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        lat = try c.decode(Double.self, forKey: .lat)
        lon = try c.decode(Double.self, forKey: .lon)
        t = try c.decode(Double.self, forKey: .t)
        alt = try c.decodeIfPresent(Double.self, forKey: .alt)
        altAccuracy = try c.decodeIfPresent(Double.self, forKey: .altAccuracy)
        altSource = try c.decodeIfPresent(String.self, forKey: .altSource)
        pressureKPa = try c.decodeIfPresent(Double.self, forKey: .pressureKPa)
        accuracy = try c.decodeIfPresent(Double.self, forKey: .accuracy)
        let known = Set(CodingKeys.allCases.map(\.stringValue))
        let all = try decoder.container(keyedBy: PointDynamicKey.self)
        var extras: [String: JSONValue] = [:]
        for key in all.allKeys where !known.contains(key.stringValue) {
            extras[key.stringValue] = try all.decode(JSONValue.self, forKey: key)
        }
        additionalFields = extras
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(lat, forKey: .lat); try c.encode(lon, forKey: .lon); try c.encode(t, forKey: .t)
        try c.encodeIfPresent(alt, forKey: .alt); try c.encodeIfPresent(altAccuracy, forKey: .altAccuracy)
        try c.encodeIfPresent(altSource, forKey: .altSource); try c.encodeIfPresent(pressureKPa, forKey: .pressureKPa)
        try c.encodeIfPresent(accuracy, forKey: .accuracy)
        var all = encoder.container(keyedBy: PointDynamicKey.self)
        let known = Set(CodingKeys.allCases.map(\.stringValue))
        for (key, value) in additionalFields where !known.contains(key) {
            try all.encode(value, forKey: PointDynamicKey(stringValue: key)!)
        }
    }
}

private enum PointDynamicKey: CodingKey {
    case string(String)
    case int(Int)
    init?(stringValue: String) { self = .string(stringValue) }
    init?(intValue: Int) { self = .int(intValue) }
    var stringValue: String { switch self { case .string(let v): return v; case .int(let v): return String(v) } }
    var intValue: Int? { if case .int(let v) = self { return v }; return nil }
}
