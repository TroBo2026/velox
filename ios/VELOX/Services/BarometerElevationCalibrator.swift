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

        var errorDescription: String? {
            switch self {
            case .invalidBarometerSample:
                return "Der Barometer-Messwert ist ungültig."
            case .invalidGPSReference:
                return "Die GPS-Höhe ist für eine Kalibrierung nicht genau genug."
            case .timestampsTooFarApart:
                return "GPS- und Barometer-Messung liegen zeitlich zu weit auseinander."
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
        guard sample.pressureKPa.isFinite, sample.pressureKPa > 0,
              sample.relativeAltitudeM.isFinite, sample.timestampMs > 0,
              baseline.relativeAltitudeM.isFinite, baseline.timestampMs > 0 else {
            throw CalibrationError.invalidBarometerSample
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
