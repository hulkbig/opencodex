import AppKit
import SwiftUI

// All ABI calls run on Tauri's AppKit main thread. Swift copies the borrowed JSON
// synchronously and never retains a Rust buffer or owns an application/run loop.
@MainActor
private final class NativeTrayPopover: NSObject, NSPopoverDelegate {
    static let shared = NativeTrayPopover()
    let popover = NSPopover()
    let store = NativeTrayStore()
    var callback: (@convention(c) (Int32) -> Void)?

    override init() {
        super.init()
        popover.behavior = .transient
        popover.animates = true
        popover.delegate = self
        popover.contentViewController = NativeTrayHostingController(store: store)
        if #available(macOS 26.0, *), NativeTrayHostingController.usesLiquidGlass {
            popover.hasFullSizeContent = true
        }
        store.action = { [weak self] event in
            guard let self else { return }
            if event == 2 || event == 3 || event == 4 { self.popover.performClose(nil) }
            if event != 2 { self.callback?(event) }
        }
    }

    func show(_ pointer: UnsafeMutableRawPointer, toggle: Bool, callback: @escaping @convention(c) (Int32) -> Void) {
        self.callback = callback
        if toggle && popover.isShown { popover.performClose(nil); return }
        let item = Unmanaged<NSStatusItem>.fromOpaque(pointer).takeUnretainedValue()
        guard let button = item.button else { return }
        if popover.isShown { return }
        let available = (button.window?.screen?.visibleFrame.height ?? 760) - 40
        popover.contentSize = NSSize(width: 420, height: max(160, min(660, available)))
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        callback(1)
    }

    func popoverDidClose(_ notification: Notification) { callback?(2) }
}

@_cdecl("ocx_native_tray_show")
@MainActor
public func nativeTrayShow(_ item: UnsafeMutableRawPointer?, _ toggle: Int32, _ callback: @escaping @convention(c) (Int32) -> Void) {
    guard Thread.isMainThread, let item else { return }
    NativeTrayPopover.shared.show(item, toggle: toggle != 0, callback: callback)
}

@_cdecl("ocx_native_tray_hide")
@MainActor
public func nativeTrayHide() {
    guard Thread.isMainThread else { return }
    NativeTrayPopover.shared.popover.performClose(nil)
}

@_cdecl("ocx_native_tray_visible")
@MainActor
public func nativeTrayVisible() -> Int32 {
    guard Thread.isMainThread else { return 0 }
    return NativeTrayPopover.shared.popover.isShown ? 1 : 0
}

@_cdecl("ocx_native_tray_update")
@MainActor
public func nativeTrayUpdate(_ bytes: UnsafePointer<UInt8>?, _ count: Int) {
    guard Thread.isMainThread, let bytes, count > 0, count <= 8 * 1024 * 1024 else { return }
    let store = NativeTrayPopover.shared.store
    do {
        store.snapshot = try NativeTraySnapshot.decode(Data(bytes: bytes, count: count))
        store.decodeFailed = false
    } catch {
        store.decodeFailed = true
    }
}
