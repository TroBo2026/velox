import SwiftUI

struct WatchRideView: View {
    @ObservedObject var workout: WatchWorkoutManager

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                Text("VELOX")
                    .font(.system(size: 23, weight: .bold, design: .rounded))
                    .tracking(1.4)
                Text(workout.statusMessage)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                VStack(spacing: 2) {
                    Text(workout.heartRateBPM.map { String(format: "%.0f", $0) } ?? "–")
                        .font(.system(size: 38, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text("BPM").font(.caption2).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))

                metric("Distanz", workout.distanceMeters.map { String(format: "%.2f km", $0 / 1_000) } ?? "–")
                metric("Geschwindigkeit", workout.cyclingSpeedMetersPerSecond.map { String(format: "%.1f km/h", $0 * 3.6) } ?? "–")
                metric("Trittfrequenz", workout.cyclingCadenceRPM.map { String(format: "%.0f rpm", $0) } ?? "–")
                metric("Leistung", workout.cyclingPowerWatts.map { String(format: "%.0f W", $0) } ?? "–")
                metric("Aktive Energie", workout.activeEnergyKcal.map { String(format: "%.0f kcal", $0) } ?? "–")
                metric("Relative Höhe", workout.relativeAltitudeM.map { String(format: "%+.1f m", $0) } ?? "–")

                if workout.isRunning {
                    HStack {
                        Button("Pause", systemImage: "pause.fill") { workout.pause() }
                            .tint(.orange)
                        Button("Stopp", systemImage: "stop.fill") { workout.stop() }
                            .tint(.red)
                    }
                    .buttonStyle(.bordered)
                } else if workout.isPaused {
                    HStack {
                        Button("Weiter", systemImage: "play.fill") { workout.resume() }
                            .tint(.green)
                        Button("Stopp", systemImage: "stop.fill") { workout.stop() }
                            .tint(.red)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button("Aufzeichnung starten", systemImage: "record.circle.fill") {
                        Task { await workout.start() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(!workout.canStart)
                }

                Text("Tour zuerst auf dem iPhone starten. VELOX fragt Health-Daten erst beim Start einer Watch-Aufzeichnung ab.")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 8)
        }
    }

    private func metric(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.caption.weight(.semibold)).monospacedDigit()
        }
    }
}
