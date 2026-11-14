import Foundation

/// Conservative summary of real Core Motion barometer samples.
/// This is session-relative change, not absolute elevation above sea level.
struct RideElevationSummary: Equatable {
    let ascentM: Double
    let descentM: Double
    let netChangeM: Double
    let sampleCount: Int

    init(samples: [BarometerSample]) {
        let ordered = samples
            .filter { $0.timestampMs > 0 && $0.relativeAltitudeM.isFinite }
            .sorted { $0.timestampMs < $1.timestampMs }

        sampleCount = ordered.count
        guard let first = ordered.first, let last = ordered.last else {
            ascentM = 0
            descentM = 0
            netChangeM = 0
            return
        }

        var ascent = 0.0
        var descent = 0.0
        var previous = first

        for sample in ordered.dropFirst() {
            let elapsed = sample.timestampMs - previous.timestampMs
            let delta = sample.relativeAltitudeM - previous.relativeAltitudeM

            // Ignore duplicate timestamps, long gaps and isolated implausible jumps.
            guard elapsed > 0, elapsed <= 15_000,
                  delta.isFinite, abs(delta) <= 8 else {
                previous = sample
                continue
            }

            // A 1 m deadband suppresses small pressure-sensor noise.
            if delta >= 1.0 {
                ascent += delta
            } else if delta <= -1.0 {
                descent += abs(delta)
            }
            previous = sample
        }

        ascentM = ascent
        descentM = descent
        netChangeM = last.relativeAltitudeM - first.relativeAltitudeM
    }
}
