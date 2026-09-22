import SwiftUI
import Charts

struct NativeTrayProviderView: View {
    let provider: NativeTrayProvider

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(provider.label).font(.subheadline.weight(.semibold))
            if provider.unavailable || provider.accounts.isEmpty {
                Text(provider.unavailable ? "Account limits unavailable" : "No quota data")
                    .font(.caption).foregroundStyle(.secondary)
            }
            ForEach(provider.accounts) { account in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(account.label).lineLimit(1).help(account.label)
                        Spacer()
                        if let plan = account.plan { Text(plan).foregroundStyle(.secondary) }
                        if account.active {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                .accessibilityLabel("Active account").help("Active account")
                        }
                    }.font(.caption)
                    if account.unavailable || account.windows.isEmpty {
                        Text("No quota data").font(.caption2).foregroundStyle(.secondary)
                    }
                    ForEach(account.windows) { window in
                        HStack(spacing: 8) {
                            Text(window.label).lineLimit(1).frame(width: 96, alignment: .leading)
                            Text(window.value.map { $0.formatted(.number.precision(.fractionLength(0))) + "%" } ?? "—")
                                .monospacedDigit().frame(width: 36, alignment: .trailing)
                            ProgressView(value: window.fill).tint(.green)
                                .accessibilityLabel(window.label)
                                .accessibilityValue(window.value.map { $0.formatted(.number.precision(.fractionLength(0))) + " percent" } ?? "Unavailable")
                            Text(NativeTrayFormat.reset(window.resetAt)).monospacedDigit()
                                .frame(width: 70, alignment: .trailing)
                                .help(window.resetDate?.formatted(date: .complete, time: .standard) ?? "Reset time unavailable")
                        }.font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct NativeTrayChartView: View {
    let chart: NativeTrayChart
    let style: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if chart.series.isEmpty {
                Text("No usage measurements").foregroundStyle(.secondary)
            } else {
                Chart {
                    ForEach(chart.series) { series in
                        ForEach(Array(series.points.enumerated()), id: \.offset) { index, point in
                            let date = Date(timeIntervalSince1970: chart.start + Double(index) * chart.bucketSeconds)
                            if style == "stackedBar" {
                                BarMark(x: .value("Time", date), y: .value("Tokens", max(0, point)), stacking: .standard)
                                    .foregroundStyle(by: .value("Model", series.label))
                            } else {
                                LineMark(x: .value("Time", date), y: .value("Tokens", max(0, point)))
                                    .foregroundStyle(by: .value("Model", series.label))
                            }
                        }
                    }
                }
                .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) }
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 3)) }
                .chartLegend(position: .bottom, spacing: 6)
                .frame(height: 160)
                .accessibilityLabel("Usage timeline")
            }
            if chart.incomplete {
                Text("Some usage records are unavailable").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}
