//! Display-only projection shared by the native collector and its contract tests.
use serde_json::{json, Map, Value};

pub fn number(value: &Value) -> Option<f64> {
    value.as_f64().filter(|n| n.is_finite() && *n >= 0.0)
}

pub fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

pub fn hidden(settings: &Value, provider: &str) -> bool {
    settings["hiddenProviders"]
        .as_array()
        .is_some_and(|rows| rows.iter().any(|row| row.as_str() == Some(provider)))
}

pub fn selected(settings: &Value, row: &Value) -> bool {
    let provider = text(row, "provider");
    let model = text(row, "model");
    !hidden(settings, provider)
        && settings["models"].as_array().map_or(true, |models| {
            models.iter().any(|item| {
                item.as_str()
                    .is_some_and(|item| item == model || item == format!("{provider}/{model}"))
            })
        })
}

pub fn display_settings(settings: Option<&Value>) -> Value {
    let enabled = |key| settings.is_some_and(|s| s[key].as_bool() == Some(true));
    json!({
        "showToday": enabled("showToday"), "show30Days": settings.is_some(),
        "showChart": enabled("showChart"), "showModels": enabled("showModels"),
        "showAccounts": settings.map_or(true, |s| s["showAccounts"].as_bool() != Some(false)),
        "showCost": enabled("showCost"),
        "chartStyle": settings.map(|s| text(s, "chartStyle")).unwrap_or("line")
    })
}

pub fn empty() -> Value {
    json!({"schemaVersion":1,"refreshing":true,"errors":[],"updatedAt":null,
        "settings":display_settings(None),"today":null,"month":null,"models":[],"chart":null,"providers":[]})
}

const TOTAL_KEYS: [&str; 9] = [
    "requests",
    "totalTokens",
    "inputTokens",
    "outputTokens",
    "cachedInputTokens",
    "cacheReadInputTokens",
    "estimatedCostUsd",
    "measuredRequests",
    "pricedRequests",
];

pub fn usage(body: &Value, settings: &Value) -> Option<(Value, Vec<Value>)> {
    let source = body["summary"].as_object()?;
    let all = body["models"].as_array()?;
    if body.get("error").is_some() {
        return None;
    }
    let rows: Vec<_> = all.iter().filter(|row| selected(settings, row)).collect();
    let filtering = settings["models"].is_array()
        || settings["hiddenProviders"]
            .as_array()
            .is_some_and(|rows| !rows.is_empty());
    let mut totals = Map::new();
    for key in TOTAL_KEYS {
        let value = if filtering {
            if rows.is_empty() {
                None
            } else {
                rows.iter()
                    .map(|row| number(&row[key]))
                    .collect::<Option<Vec<_>>>()
                    .map(|values| values.iter().sum())
            }
        } else {
            source.get(key).and_then(number)
        };
        totals.insert(key.into(), json!(value));
    }
    // Both spellings exist on management projections; prefer the exact cache-read field.
    if !totals["cacheReadInputTokens"].is_null() {
        totals.insert(
            "cachedInputTokens".into(),
            totals["cacheReadInputTokens"].clone(),
        );
    }
    if number(&body["summary"]["coverageRatio"]) == Some(0.0) && !filtering {
        totals.insert("measuredRequests".into(), json!(0));
    }
    totals.remove("cacheReadInputTokens");
    totals.insert(
        "incomplete".into(),
        json!(["usageIncomplete", "historyTruncated", "entriesTruncated"]
            .iter()
            .any(|key| body[key].as_bool() == Some(true))),
    );
    let models = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            let unmeasured = number(&row["requests"]).is_some_and(|n| n > 0.0)
                && (number(&row["measuredRequests"]) == Some(0.0)
                    || number(&row["coverageRatio"]) == Some(0.0));
            json!({"id":format!("{}/{}/{}",text(row,"provider"),text(row,"model"),index),
            "label":text(row,"model"),"requests":number(&row["requests"]),
            "tokens":if unmeasured { None } else { number(&row["totalTokens"]) }})
        })
        .collect();
    Some((Value::Object(totals), models))
}

pub fn chart(body: &Value, settings: &Value) -> Option<Value> {
    let start = number(&body["start"])?;
    let bucket = number(&body["bucketSeconds"])?;
    if bucket == 0.0 || start >= 253_402_300_800.0 {
        return None;
    }
    let rows = body["series"].as_array()?;
    let series: Option<Vec<_>> = rows
        .iter()
        .filter(|row| selected(settings, row))
        .enumerate()
        .map(|(index, row)| {
            let points: Option<Vec<_>> = row["points"].as_array()?.iter().map(number).collect();
            let label = row["id"].as_str()?;
            Some(json!({"id":format!("{}:{index}",text(row,"id")),"label":label,"points":points?}))
        })
        .collect();
    Some(
        json!({"start":start,"bucketSeconds":bucket,"series":series?,
        "incomplete":body["truncated"].as_bool()==Some(true)||number(&body["missingMeasurements"]).is_some_and(|n|n>0.0)}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projection_filters_and_does_not_invent_measurements_or_copy_secrets() {
        let settings = json!({"models":["a/kept"],"hiddenProviders":[]});
        let body = json!({"apiKey":"do-not-copy", "summary":{"totalTokens":100},"models":[
            {"provider":"a","model":"kept","requests":2,"measuredRequests":0,"totalTokens":0,"apiKey":"hidden"},
            {"provider":"b","model":"dropped","requests":3,"totalTokens":100}]});
        let (totals, models) = usage(&body, &settings).unwrap();
        assert_eq!(totals["requests"], 2.0);
        assert!(totals["inputTokens"].is_null());
        assert!(models[0]["tokens"].is_null());
        assert_eq!(models.len(), 1);
        assert!(!json!([totals, models]).to_string().contains("apiKey"));
    }
    #[test]
    fn no_matches_and_malformed_reports_remain_unknown() {
        let settings = json!({"models":[],"hiddenProviders":[]});
        let (totals, models) =
            usage(&json!({"summary":{"requests":4},"models":[]}), &settings).unwrap();
        assert!(totals["requests"].is_null());
        assert!(models.is_empty());
        assert!(usage(&json!({"summary":{},"models":"bad"}), &settings).is_none());
    }
    #[test]
    fn cache_alias_and_incomplete_chart_are_preserved() {
        let settings = json!({"models":null,"hiddenProviders":[]});
        let (totals,_)=usage(&json!({"summary":{"cacheReadInputTokens":9,"cachedInputTokens":2},"models":[],"historyTruncated":true}),&settings).unwrap();
        assert_eq!(totals["cachedInputTokens"], 9.0);
        assert_eq!(totals["incomplete"], true);
        let c = chart(
            &json!({"start":1000,"bucketSeconds":60,"series":[],"missingMeasurements":1}),
            &settings,
        )
        .unwrap();
        assert_eq!(c["incomplete"], true);
        assert!(chart(
            &json!({"start":1000,"bucketSeconds":0,"series":[]}),
            &settings
        )
        .is_none());
    }

    #[test]
    fn same_model_from_two_providers_keeps_distinct_series_labels() {
        let settings = json!({"models":null,"hiddenProviders":[]});
        let value = chart(
            &json!({"start":1000,"bucketSeconds":60,"series":[
            {"id":"first/shared","provider":"first","model":"shared","points":[1,2]},
            {"id":"second/shared","provider":"second","model":"shared","points":[3,4]}]}),
            &settings,
        )
        .unwrap();
        assert_eq!(value["series"][0]["label"], "first/shared");
        assert_eq!(value["series"][1]["label"], "second/shared");
        assert_ne!(value["series"][0]["id"], value["series"][1]["id"]);
    }
}
