import Combine
import CoreMotion
import Foundation
import HealthKit
import WatchConnectivity

@MainActor
final class WatchWorkoutManager: NSObject, ObservableObject {
    @Published private(set) var statusMessage = "Verbinde VELOX mit dem iPhone …"
    @Published private(set) var heartRateBPM: Double?
    @Published private(set) var activeEnergyKcal: Double?
    @Published private(set) var distanceMeters: Double?
    @Published private(set) var cyclingCadenceRPM: Double?
    @Published private(set) var cyclingPowerWatts: Double?
    @Published private(set) var cyclingSpeedMetersPerSecond: Double?
    @Published private(set) var relativeAltitudeM: Double?
    @Published private(set) var isRunning = false
    @Published private(set) var isPaused = false
    @Published private(set) var canStart = false

    private let healthStore = HKHealthStore()
    private let altimeter = CMAltimeter()
    private var workoutSession: HKWorkoutSession?
    private var workoutBuilder: HKLiveWorkoutBuilder?
    private var rideID: String?
    private var wcSession: WCSession?

    func activateConnectivity() {
        guard WCSession.isSupported() else {
            statusMessage = "WatchConnectivity wird nicht unterstützt."
            return
        }
        let session = WCSession.default
        wcSession = session
        session.delegate = self
        session.activate()
    }

    func start() async {
        guard canStart, let rideID, HKHealthStore.isHealthDataAvailable() else {
            statusMessage = "Bitte zuerst eine aktive VELOX-Tour auf dem iPhone starten."
            return
        }

        guard let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate),
              let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
              let distanceType = HKObjectType.quantityType(forIdentifier: .distanceCycling),
              let cadenceType = HKObjectType.quantityType(forIdentifier: .cyclingCadence),
              let powerType = HKObjectType.quantityType(forIdentifier: .cyclingPower),
              let speedType = HKObjectType.quantityType(forIdentifier: .cyclingSpeed) else {
            statusMessage = "Benötigte HealthKit-Datentypen sind nicht verfügbar."
            return
        }

        let shareTypes: Set<HKSampleType> = [HKObjectType.workoutType()]
        let readTypes: Set<HKObjectType> = [heartRateType, energyType, distanceType, cadenceType, powerType, speedType]
        do {
            try await requestAuthorization(share: shareTypes, read: readTypes)
            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .cycling
            configuration.locationType = .outdoor

            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            session.delegate = self
            builder.delegate = self
            workoutSession = session
            workoutBuilder = builder

            let startDate = Date()
            session.startActivity(with: startDate)
            builder.beginCollection(withStart: startDate) { [weak self] success, error in
                Task { @MainActor in
                    guard let self else { return }
                    if success {
                        self.isRunning = true
                        self.isPaused = false
                        self.statusMessage = "VELOX zeichnet die Watch-Sensoren auf."
                        self.startAltimeter()
                    } else {
                        self.statusMessage = error?.localizedDescription ?? "Workout konnte nicht gestartet werden."
                    }
                }
            }
        } catch {
            statusMessage = "HealthKit/Workout konnte nicht gestartet werden: \(error.localizedDescription)"
        }
    }

    func pause() {
        guard isRunning else { return }
        sendCommand(.pause)
        workoutSession?.pause()
        altimeter.stopRelativeAltitudeUpdates()
        isRunning = false
        isPaused = true
        statusMessage = "Aufzeichnung pausiert."
    }

    func resume() {
        guard isPaused else { return }
        sendCommand(.resume)
        workoutSession?.resume()
        isRunning = true
        isPaused = false
        statusMessage = "Aufzeichnung fortgesetzt."
        startAltimeter()
    }

    func stop() {
        sendCommand(.stop)
        finishWorkout()
    }

    private func finishWorkout() {
        guard workoutSession != nil else { return }
        altimeter.stopRelativeAltitudeUpdates()
        workoutSession?.end()
        isRunning = false
        isPaused = false
        statusMessage = "Workout wird abgeschlossen."
        guard let builder = workoutBuilder else { return }
        builder.endCollection(withEnd: Date()) { [weak self] _, _ in
            builder.finishWorkout { _, error in
                Task { @MainActor in
                    self?.statusMessage = error == nil ? "Watch-Aufzeichnung abgeschlossen." : "Workout konnte nicht gespeichert werden."
                    self?.workoutSession = nil
                    self?.workoutBuilder = nil
                }
            }
        }
    }

    private func sendCommand(_ action: WatchRideCommand.Action) {
        guard let rideID, let session = wcSession, session.activationState == .activated else { return }
        let payload: [String: Any] = [
            "schemaVersion": 1,
            "messageType": "rideCommand",
            "id": UUID().uuidString,
            "rideID": rideID,
            "action": action.rawValue,
            "timestampMs": Int64(Date().timeIntervalSince1970 * 1_000)
        ]
        session.transferUserInfo(payload)
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    private func requestAuthorization(share: Set<HKSampleType>, read: Set<HKObjectType>) async throws {
        try await withCheckedThrowingContinuation { continuation in
            healthStore.requestAuthorization(toShare: share, read: read) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: WatchWorkoutError.authorizationUnavailable)
                }
            }
        }
    }

    private func startAltimeter() {
        guard CMAltimeter.isRelativeAltitudeAvailable() else { return }
        altimeter.startRelativeAltitudeUpdates(to: .main) { [weak self] data, error in
            guard let data, error == nil else { return }
            Task { @MainActor in
                guard let self, self.isRunning else { return }
                let altitude = data.relativeAltitude.doubleValue
                guard altitude.isFinite else { return }
                self.relativeAltitudeM = altitude
                let unixTime = Date().timeIntervalSince1970
                    - ProcessInfo.processInfo.systemUptime
                    + data.timestamp
                self.sendSample(kind: .relativeAltitudeM, value: altitude, timestamp: Date(timeIntervalSince1970: unixTime).timeIntervalSince1970 * 1_000, source: .coreMotion)
            }
        }
    }

    private func collectStatistics(for types: Set<HKSampleType>) {
        guard let builder = workoutBuilder else { return }

        if let type = HKObjectType.quantityType(forIdentifier: .heartRate),
           types.contains(type),
           let statistics = builder.statistics(for: type),
           let quantity = statistics.mostRecentQuantity(),
           let interval = statistics.mostRecentQuantityDateInterval() {
            let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            heartRateBPM = bpm
            sendSample(kind: .heartRateBPM, value: bpm, timestamp: interval.end.timeIntervalSince1970 * 1_000, source: .healthKit)
        }

        if let type = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
           types.contains(type),
           let statistics = builder.statistics(for: type),
           let quantity = statistics.sumQuantity(),
           let interval = statistics.mostRecentQuantityDateInterval() {
            let kcal = quantity.doubleValue(for: .kilocalorie())
            activeEnergyKcal = kcal
            sendSample(kind: .activeEnergyKcal, value: kcal, timestamp: interval.end.timeIntervalSince1970 * 1_000, source: .healthKit)
        }

        if let type = HKObjectType.quantityType(forIdentifier: .distanceCycling),
           types.contains(type),
           let statistics = builder.statistics(for: type),
           let quantity = statistics.sumQuantity(),
           let interval = statistics.mostRecentQuantityDateInterval() {
            let meters = quantity.doubleValue(for: .meter())
            let timestampMs = Int64(interval.end.timeIntervalSince1970 * 1_000)
            distanceMeters = meters
            sendSample(kind: .distanceMeters, value: meters, timestamp: Double(timestampMs), source: .healthKit)
        }

        if let type = HKObjectType.quantityType(forIdentifier: .cyclingCadence),
           types.contains(type),
           let statistics = builder.statistics(for: type),
           let quantity = statistics.mostRecentQuantity(),
           let interval = statistics.mostRecentQuantityDateInterval() {
            let rpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            cyclingCadenceRPM = rpm
            sendSample(kind: .cadenceRPM, value: rpm, timestamp: interval.end.timeIntervalSince1970 * 1_000, source: .healthKit)
        }

        if let type = HKObjectType.quantityType(forIdentifier: .cyclingPower),
           types.contains(type),
           let statistics = builder.statistics(for: type),
           let quantity = statistics.mostRecentQuantity(),
           let interval = statistics.mostRecentQuantityDateInterval() {
            let watts = quantity.doubleValue(for: .watt())
            cyclingPowerWatts = watts
            sendSample(kind: .cyclingPowerWatts, value: watts, timestamp: interval.end.timeIntervalSince1970 * 1_000, source: .healthKit)
        }

        if let type = HKObjectType.quantityType(forIdentifier: .cyclingSpeed),
           types.contains(type),
           let statistics = builder.statistics(for: type),
           let quantity = statistics.mostRecentQuantity(),
           let interval = statistics.mostRecentQuantityDateInterval() {
            let metersPerSecond = quantity.doubleValue(for: HKUnit.meter().unitDivided(by: .second()))
            cyclingSpeedMetersPerSecond = metersPerSecond
            sendSample(kind: .speedMetersPerSecond, value: metersPerSecond, timestamp: interval.end.timeIntervalSince1970 * 1_000, source: .healthKit)
        }
    }

    private func sendSample(kind: WatchSensorSample.Kind, value: Double, timestamp: Double, source: WatchSensorSample.Source) {
        guard let rideID, timestamp.isFinite, timestamp > 0 else { return }
        let payload: [String: Any] = [
            "schemaVersion": 1,
            "id": UUID().uuidString,
            "rideID": rideID,
            "kind": kind.rawValue,
            "timestampMs": Int64(timestamp),
            "value": value,
            "source": source.rawValue
        ]
        guard let session = wcSession, session.activationState == .activated else { return }
        session.transferUserInfo(payload)
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    private enum WatchWorkoutError: Error {
        case authorizationUnavailable
    }
}

extension WatchWorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        Task { @MainActor in
            if toState == .ended {
                isRunning = false
                isPaused = false
            }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            statusMessage = "Workout-Fehler: \(error.localizedDescription)"
            isRunning = false
            isPaused = false
        }
    }
}

extension WatchWorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf types: Set<HKSampleType>) {
        Task { @MainActor in collectStatistics(for: types) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) { }
}

extension WatchWorkoutManager: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            if let error {
                statusMessage = "Watch-Verbindung fehlgeschlagen: \(error.localizedDescription)"
            } else {
                updateRideContext(session.receivedApplicationContext)
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in updateRideContext(applicationContext) }
    }

    private func updateRideContext(_ context: [String: Any]) {
        let incomingRideID = context["rideID"] as? String
        let rideState = context["rideState"] as? String ?? "idle"

        if let existingRideID = rideID, existingRideID != incomingRideID,
           workoutSession != nil {
            finishWorkout()
        }
        rideID = incomingRideID
        canStart = incomingRideID != nil && rideState == "recording"

        if rideState == "paused" && isRunning {
            pauseFromPhone()
        } else if rideState == "recording" && isPaused {
            resumeFromPhone()
        } else if rideState != "recording" && rideState != "paused" && workoutSession != nil {
            finishWorkout()
        }

        if canStart {
            statusMessage = "iPhone-Tour erkannt. Watch-Aufzeichnung kann gestartet werden."
        } else if incomingRideID == nil {
            statusMessage = "Bitte eine Tour in der VELOX-iPhone-App starten."
        } else {
            statusMessage = "iPhone-Tour ist nicht aktiv."
        }
    }

    private func pauseFromPhone() {
        workoutSession?.pause()
        altimeter.stopRelativeAltitudeUpdates()
        isRunning = false
        isPaused = true
    }

    private func resumeFromPhone() {
        workoutSession?.resume()
        isRunning = true
        isPaused = false
        startAltimeter()
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) { }
}
