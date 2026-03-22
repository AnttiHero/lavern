/**
 * Lavern Menu Bar — macOS status bar presence for Clawern.
 *
 * Shows a compact popover with:
 * - Document counts (reviewed, flagged, pending, errors)
 * - Budget gauge (spent / total)
 * - Last scan time
 * - Quick actions: Scan Now, Open Dashboard
 *
 * Polls the Claw API every 30 seconds.
 */

import AppKit
import SwiftUI

// MARK: - Data Model

struct ClawStatus: Codable {
    struct Documents: Codable {
        let total: Int
        let reviewed: Int
        let flagged: Int
        let pending: Int
        let errors: Int
    }
    struct Budget: Codable {
        let totalUsd: Double
        let spentUsd: Double
        let remainingUsd: Double
        let exhausted: Bool
    }
    struct Profile: Codable {
        let company: String
    }

    let profile: Profile
    let documents: Documents
    let budget: Budget
    let lastScan: String
    let paused: Bool?
}

// MARK: - API Client

class ClawClient: ObservableObject {
    @Published var status: ClawStatus?
    @Published var error: String?
    @Published var loading = false

    private let baseUrl: String
    private var timer: Timer?

    init() {
        self.baseUrl = ProcessInfo.processInfo.environment["LAVERN_API_URL"] ?? "http://localhost:3000"
    }

    func startPolling() {
        fetchStatus()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.fetchStatus()
        }
    }

    func stopPolling() {
        timer?.invalidate()
        timer = nil
    }

    func fetchStatus() {
        loading = true
        guard let url = URL(string: "\(baseUrl)/api/claw/status") else { return }

        URLSession.shared.dataTask(with: url) { [weak self] data, response, err in
            DispatchQueue.main.async {
                self?.loading = false
                if let err = err {
                    self?.error = err.localizedDescription
                    self?.status = nil
                    return
                }
                guard let data = data else { return }
                do {
                    let decoded = try JSONDecoder().decode(ClawStatus.self, from: data)
                    self?.status = decoded
                    self?.error = nil
                } catch {
                    self?.error = "Failed to parse response"
                }
            }
        }.resume()
    }

    func triggerScan() {
        guard let url = URL(string: "\(baseUrl)/api/claw/scan") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self?.fetchStatus()
            }
        }.resume()
    }

    func openDashboard() {
        if let url = URL(string: "\(baseUrl)/#/claw") {
            NSWorkspace.shared.open(url)
        }
    }

    func openDispatch() {
        if let url = URL(string: "\(baseUrl)/#/dispatch") {
            NSWorkspace.shared.open(url)
        }
    }
}

// MARK: - Popover View

struct StatusPopover: View {
    @ObservedObject var client: ClawClient

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text("LAVERN")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(4)
                    .foregroundColor(.secondary)
                Spacer()
                if client.loading {
                    ProgressView()
                        .scaleEffect(0.6)
                }
            }

            if let status = client.status {
                // Company
                Text(status.profile.company)
                    .font(.system(size: 14, weight: .semibold))

                if status.paused == true {
                    Text("⏸ PAUSED")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(4)
                }

                Divider()

                // Documents
                HStack(spacing: 16) {
                    statItem(label: "Reviewed", value: "\(status.documents.reviewed)", color: .green)
                    statItem(label: "Flagged", value: "\(status.documents.flagged)", color: .red)
                    statItem(label: "Pending", value: "\(status.documents.pending)", color: .orange)
                    statItem(label: "Errors", value: "\(status.documents.errors)", color: status.documents.errors > 0 ? .red : .secondary)
                }

                // Budget
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text("Budget")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.secondary)
                        Spacer()
                        Text("$\(String(format: "%.2f", status.budget.spentUsd)) / $\(String(format: "%.2f", status.budget.totalUsd))")
                            .font(.system(size: 11, design: .monospaced))
                    }

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.gray.opacity(0.2))
                            RoundedRectangle(cornerRadius: 3)
                                .fill(budgetColor(status.budget))
                                .frame(width: geo.size.width * budgetFraction(status.budget))
                        }
                    }
                    .frame(height: 6)
                }

                Divider()

                // Actions
                HStack(spacing: 8) {
                    Button("Scan Now") { client.triggerScan() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                    Button("Dashboard") { client.openDashboard() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                    Button("Dispatch") { client.openDispatch() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }

            } else if let error = client.error {
                Text(error)
                    .font(.system(size: 12))
                    .foregroundColor(.red)

                Button("Open Dashboard") { client.openDashboard() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            } else {
                Text("Connecting to Clawern...")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            Divider()

            Button("Quit Lavern Menu Bar") {
                NSApplication.shared.terminate(nil)
            }
            .buttonStyle(.plain)
            .font(.system(size: 11))
            .foregroundColor(.secondary)
        }
        .padding(16)
        .frame(width: 320)
    }

    private func statItem(label: String, value: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 16, weight: .bold, design: .monospaced))
                .foregroundColor(color)
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(.secondary)
                .textCase(.uppercase)
        }
    }

    private func budgetFraction(_ budget: ClawStatus.Budget) -> Double {
        guard budget.totalUsd > 0 else { return 0 }
        return min(1, budget.spentUsd / budget.totalUsd)
    }

    private func budgetColor(_ budget: ClawStatus.Budget) -> Color {
        let pct = budgetFraction(budget)
        if pct > 0.9 { return .red }
        if pct > 0.7 { return .orange }
        return .green
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var popover: NSPopover!
    let client = ClawClient()

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Create status bar item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.title = "L"
            button.font = NSFont(name: "Georgia", size: 13)
            button.action = #selector(togglePopover)
            button.target = self
        }

        // Create popover
        popover = NSPopover()
        popover.contentSize = NSSize(width: 320, height: 360)
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(rootView: StatusPopover(client: client))

        // Start polling
        client.startPolling()
    }

    @objc func togglePopover() {
        guard let button = statusItem.button else { return }

        if popover.isShown {
            popover.performClose(nil)
        } else {
            client.fetchStatus() // Refresh on open
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        client.stopPolling()
    }
}

// MARK: - Entry Point

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // No dock icon
app.run()
