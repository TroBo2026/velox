import Foundation

struct GPSAltitudeReference {
    let altitudeM: Double
    let verticalAccuracyM: Double
    let timestampMs: Int64
}

struct CalibratedBarometerReading: Equatable {
    let altitudeM: Double
    let pressureKPa: Double
    let timestampMs: Int64
}

/// Anchors Core Motion's session-relative altitude to one nearby, sufficiently
/// accurate GPS altitude. It deliberately does not invent a sea-level pressure
/// or silently drift-correct the barometer.
enum BarometerElevationCalibrator {
    enum CalibrationError: LocalizedError {
        case invalidBarometerSample
        case invalidGPSReference
        case timestampsTooFarApart
        case differentBarometerSession
        case samplePrecedesBaseline

        var errorDescription: String? {
            switch self {
            case .invalidBarometerSample:
                return "Der Barometer-Messwert ist ungültig."
            case .invalidGPSReference:
                return "Die GPS-Höhe ist für eine Kalibrierung nicht genau genug."
            case .timestampsTooFarApart:
                return "GPS- und Barometer-Messung liegen zeitlich zu weit auseinander."
            case .differentBarometerSession:
                return "Basis- und Folgemessung stammen aus unterschiedlichen Barometersitzungen."
            case .samplePrecedesBaseline:
                return "Der Barometer-Messwert liegt zeitlich vor seiner Basismessung."
            }
        }
    }

    static func calibrate(
        sample: BarometerSample,
        baseline: BarometerSample,
        against reference: GPSAltitudeReference,
        maximumGPSVerticalAccuracyM: Double = 10,
        maximumTimeDifferenceMs: Int64 = 10_000
    ) throws -> CalibratedBarometerReading {
        guard sample.pressureKPa.isFinite, (30...110).contains(sample.pressureKPa),
              sample.relativeAltitudeM.isFinite, (-1000...10000).contains(sample.relativeAltitudeM), sample.timestampMs > 0,
              baseline.pressureKPa.isFinite, (30...110).contains(baseline.pressureKPa),
              baseline.relativeAltitudeM.isFinite, (-1000...10000).contains(baseline.relativeAltitudeM),
              baseline.timestampMs > 0 else {
            throw CalibrationError.invalidBarometerSample
        }
        guard sample.sessionID == baseline.sessionID else {
            throw CalibrationError.differentBarometerSession
        }
        guard sample.timestampMs >= baseline.timestampMs else {
            throw CalibrationError.samplePrecedesBaseline
        }

        guard reference.altitudeM.isFinite,
              reference.verticalAccuracyM.isFinite,
              reference.verticalAccuracyM >= 0,
              maximumGPSVerticalAccuracyM.isFinite,
              maximumGPSVerticalAccuracyM > 0,
              reference.verticalAccuracyM <= maximumGPSVerticalAccuracyM,
              reference.timestampMs > 0 else {
            throw CalibrationError.invalidGPSReference
        }

        let difference = baseline.timestampMs >= reference.timestampMs
            ? baseline.timestampMs - reference.timestampMs
            : reference.timestampMs - baseline.timestampMs
        guard difference <= maximumTimeDifferenceMs else {
            throw CalibrationError.timestampsTooFarApart
        }

        // The GPS fix anchors the baseline sample. Subtracting that baseline is
        // essential because Core Motion altitude is relative to session start.
        let altitude = reference.altitudeM + (sample.relativeAltitudeM - baseline.relativeAltitudeM)
        guard altitude.isFinite else {
            throw CalibrationError.invalidBarometerSample
        }

        return CalibratedBarometerReading(
            altitudeM: altitude,
            pressureKPa: sample.pressureKPa,
            timestampMs: sample.timestampMs
        )
    }

    /// Difference between a later trusted GPS fix and the barometer-derived
    /// altitude. A caller can use this to flag drift or start a new segment;
    /// this function never applies an unrequested correction.
    static func driftDifferenceM(
        barometerAltitudeM: Double,
        gpsReference: GPSAltitudeReference,
        maximumGPSVerticalAccuracyM: Double = 10
    ) -> Double? {
        guard barometerAltitudeM.isFinite,
              gpsReference.altitudeM.isFinite,
              gpsReference.verticalAccuracyM.isFinite,
              gpsReference.verticalAccuracyM >= 0,
              maximumGPSVerticalAccuracyM.isFinite,
              maximumGPSVerticalAccuracyM > 0,
              gpsReference.verticalAccuracyM <= maximumGPSVerticalAccuracyM else {
            return nil
        }
        return gpsReference.altitudeM - barometerAltitudeM
    }
}
