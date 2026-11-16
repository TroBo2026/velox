import Combine
import Foundation
import WatchConnectivity

/// iPhone-side transport for a future VELOX watchOS companion.
/// No sensor values are generated here: heart rate is accepted only from a
/// real message sent by the paired Watch app.
final class WatchConnectivityService: NSObject, ObservableObject {
    @Published private(set) var isSupported = WCSession.isSupported()
    @Published private(set) var isPaired = false
    @Published private(set) var isWatchAppInstalled = false
    @Published private(set) var isReachable = false
    @Published private(set) var latestHeartRateBPM: Double?
    @Published private(set) var lastHeartRateDate: Date?
    @Published private(set) var statusMessage = "Apple Watch wird geprüft."

    private let session: WCSession? = WCSession.isSupported() ? WCSession.default : nil

    override init() {
        super.init()
        guard let session else {
            statusMessage = "WatchConnectivity wird auf diesem Gerät nicht unterstützt."
            return
        }
        session.delegate = self
        session.activate()
    }

    func refreshStatus() {
        guard let session else { return }
        DispatchQueue.main.async {
            self.isPaired = session.isPaired
            self.isWatchAppInstalled = session.isWatchAppInstalled
            self.isReachable = session.isReachable
            if !session.isPaired {
                self.statusMessage = "Keine gekoppelte Apple Watch erkannt."
            } else if !session.isWatchAppInstalled {
                self.statusMessage = "Watch gekoppelt; VELOX Watch-App ist noch nicht installiert."
            } else if session.isReachable {
                self.statusMessage = "VELOX Watch ist verbunden."
            } else {
                self.statusMessage = "Watch-App installiert; Verbindung derzeit nicht erreichbar."
            }
        }
    }

    /// Sends only the current ride state and accumulated distance.
    /// Application context is a latest-value channel, not a lossless sensor log.
    func updateRideSnapshot(distanceMeters: Double, rideState: String) {
        guard let session, session.activationState == .activated else { return }
        guard distanceMeters.isFinite, distanceMeters >= 0 else { return }

        let context: [String: Any] = [
            "schemaVersion": 1,
            "distanceMeters": distanceMeters,
            "rideState": rideState,
            "updatedAt": Date().timeIntervalSince1970
        ]
        do {
            try session.updateApplicationContext(context)
        } catch {
            DispatchQueue.main.async {
                self.statusMessage = "Watch-Synchronisierung fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }

    private func accept(message: [String: Any]) {
        guard let bpm = message["heartRateBPM"] as? Double,
              bpm.isFinite, (25...240).contains(bpm) else { return }
        let timestamp = (message["timestamp"] as? TimeInterval).map(Date.init(timeIntervalSince1970:)) ?? Date()
        DispatchQueue.main.async {
            self.latestHeartRateBPM = bpm
            self.lastHeartRateDate = timestamp
        }
    }
}

extension WatchConnectivityService: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        refreshStatus()
        if let error {
            DispatchQueue.main.async {
                self.statusMessage = "Watch-Aktivierung fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        refreshStatus()
    }

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
        refreshStatus()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        refreshStatus()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        accept(message: message)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        accept(message: message)
        replyHandler(["received": true])
    }
}
