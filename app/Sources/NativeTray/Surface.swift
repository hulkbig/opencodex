import AppKit
import SwiftUI

/// A single native material surface; the popover clips its outer silhouette.
/// The SwiftUI content deliberately paints no web-style background or second radius.
@MainActor
final class NativeTrayHostingController: NSViewController {
    private let hosting: NSHostingController<NativeTrayUsageView>

    static var usesLiquidGlass: Bool {
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) { return true }
        #endif
        return false
    }

    init(store: NativeTrayStore) {
        hosting = NSHostingController(rootView: NativeTrayUsageView(store: store))
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { nil }

    override func loadView() {
        addChild(hosting)
        #if compiler(>=6.2)
        if #available(macOS 26.0, *) {
            let glass = NSGlassEffectView()
            glass.style = .regular
            // AppKit's popover owns all outer corners and the anchor arrow.
            glass.cornerRadius = 0
            glass.contentView = hosting.view
            view = glass
            hosting.view.translatesAutoresizingMaskIntoConstraints = false
            NSLayoutConstraint.activate([
                hosting.view.leadingAnchor.constraint(equalTo: glass.safeAreaLayoutGuide.leadingAnchor),
                hosting.view.trailingAnchor.constraint(equalTo: glass.safeAreaLayoutGuide.trailingAnchor),
                hosting.view.topAnchor.constraint(equalTo: glass.safeAreaLayoutGuide.topAnchor),
                hosting.view.bottomAnchor.constraint(equalTo: glass.safeAreaLayoutGuide.bottomAnchor),
            ])
            return
        }
        #endif
        view = hosting.view
    }
}
