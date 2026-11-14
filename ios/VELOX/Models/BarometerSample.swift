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
    }
}
