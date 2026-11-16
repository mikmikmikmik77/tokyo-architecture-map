#!/usr/bin/env python3
"""건축물 좌표 검증용 근거 수집 스크립트.

OpenStreetMap(Nominatim), Wikidata, Wikipedia(ja/en), 일본 국토지리원(GSI)에
건물 이름으로 질의해서 돌아온 좌표를 그대로 tools/coords_evidence.json 에 저장한다.
판단(어느 좌표를 채택할지)은 하지 않는다. 사람이/리뷰어가 근거를 보고 결정한다.

실행: python3 tools/verify_coords.py
"""
import json, subprocess, time, urllib.parse, os, sys

UA = "coord-check-script/1.0 (one-off building coordinate verification)"
VIEWBOX = "139.55,35.80,139.95,35.55"  # 도쿄 중심부 (left,top,right,bottom)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "coords_evidence.json")

# id: (기존 좌표, [OSM 검색어...], [위키 제목/검색어...])
B = {
 "b01": ((35.7154,139.7758), ["国立西洋美術館"], ["国立西洋美術館"]),
 "b02": ((35.7145,139.7746), ["東京文化会館"], ["東京文化会館"]),
 "b03": ((35.7115,139.7618), ["ダイワユビキタス学術研究館", "Daiwa Ubiquitous Computing Research Building"], ["ダイワユビキタス学術研究館"]),
 "b04": ((35.7203,139.7765), ["国際子ども図書館"], ["国際子ども図書館"]),
 "b05": ((35.7107,139.7966), ["浅草文化観光センター"], ["浅草文化観光センター"]),
 "b06": ((35.6975,139.7982), ["すみだ北斎美術館"], ["すみだ北斎美術館"]),
 "b07": ((35.7101,139.8007), ["アサヒグループ本社ビル", "アサヒビール本部ビル", "スーパードライホール", "アサヒビールタワー"], ["アサヒビールタワー", "スーパードライホール", "アサヒグループ本社ビル"]),
 "b08": ((35.6768,139.7638), ["東京国際フォーラム"], ["東京国際フォーラム"]),
 "b09": ((35.6797,139.7648), ["KITTE丸の内", "KITTE", "JPタワー"], ["JPタワー", "KITTE"]),
 "b10": ((35.6783,139.7632), ["三菱一号館美術館"], ["三菱一号館美術館", "三菱一号館"]),
 "b11": ((35.6812,139.7671), ["東京駅丸の内駅舎", "東京駅 丸の内駅舎", "東京駅"], ["東京駅", "東京駅丸の内駅舎"]),
 "b12": ((35.6723,139.7628), ["メゾンエルメス", "銀座メゾンエルメス", "Maison Hermès"], ["メゾンエルメス", "銀座メゾンエルメス"]),
 "b13": ((35.6741,139.7663), ["ミキモト銀座2丁目店", "MIKIMOTO Ginza 2", "ミキモト 銀座2丁目"], ["ミキモト銀座2丁目店", "MIKIMOTO Ginza 2"]),
 "b14": ((35.6696,139.7641), ["GINZA SIX", "ギンザシックス"], ["GINZA SIX"]),
 "b15": ((35.6722,139.7625), ["東急プラザ銀座"], ["東急プラザ銀座"]),
 "b16": ((35.6702,139.7634), ["ニコラス・G・ハイエックセンター", "ニコラス・G・ハイエック センター", "Nicolas G. Hayek Center"], ["ニコラス・G・ハイエックセンター", "Nicolas G. Hayek Center"]),
 "b17": ((35.6604,139.7397), ["麻布台ヒルズ ガーデンプラザ", "麻布台ヒルズガーデンプラザA", "麻布台ヒルズ"], ["麻布台ヒルズ"]),
 "b18": ((35.6653,139.7301), ["21_21 DESIGN SIGHT"], ["21 21 DESIGN SIGHT", "21_21 DESIGN SIGHT"]),
 "b19": ((35.6653,139.7264), ["国立新美術館"], ["国立新美術館"]),
 "b20": ((35.6662,139.7315), ["サントリー美術館"], ["サントリー美術館"]),
 "b21": ((35.6616,139.7176), ["根津美術館"], ["根津美術館"]),
 "b22": ((35.6629,139.7144), ["プラダ 青山店", "プラダブティック青山", "Prada Aoyama"], ["プラダ青山店", "プラダ ブティック青山店", "Prada Aoyama"]),
 "b23": ((35.6631,139.7150), ["サニーヒルズ南青山", "微熱山丘", "SunnyHills"], ["サニーヒルズ南青山", "微熱山丘"]),
 "b24": ((35.6663,139.7104), ["トッズ表参道ビル", "TOD'S 表参道", "Tod's Omotesando"], ["TOD'S表参道ビル", "トッズ表参道ビル"]),
 "b25": ((35.6672,139.7093), ["表参道ヒルズ"], ["表参道ヒルズ"]),
 "b26": ((35.6622,139.7132), ["スパイラル 青山", "スパイラルホール", "Spiral 南青山"], ["スパイラル (複合文化施設)", "スパイラルホール", "スパイラル"]),
 "b27": ((35.6633,139.7146), ["ザ・ジュエルズ・オブ・青山", "The Jewels of Aoyama", "ジュエルズオブ青山"], ["ザ・ジュエルズ・オブ・青山"]),
 "b28": ((35.6687,139.7056), ["東急プラザ表参道原宿", "東急プラザ表参道「オモカド」", "東急プラザ表参道 オモカド"], ["東急プラザ表参道原宿", "東急プラザ表参道「オモカド」"]),
 "b29": ((35.6624,139.7018), ["神宮通公園トイレ", "神宮通公園 トイレ", "神宮通公園"], ["神宮通公園", "THE TOKYO TOILET"]),
 "b30": ((35.6584,139.7022), ["SHIBUYA SKY", "渋谷スクランブルスクエア"], ["渋谷スクランブルスクエア", "SHIBUYA SKY"]),
 "b31": ((35.6621,139.7016), ["MIYASHITA PARK", "ミヤシタパーク", "宮下公園"], ["MIYASHITA PARK", "宮下公園"]),
 "b32": ((35.6679,139.6974), ["国立代々木競技場 第一体育館", "国立代々木競技場"], ["国立代々木競技場"]),
 "b33": ((35.6915,139.6968), ["モード学園コクーンタワー", "コクーンタワー"], ["モード学園コクーンタワー"]),
 "b34": ((35.6894,139.6917), ["東京都庁第一本庁舎", "東京都庁舎", "東京都庁"], ["東京都庁舎"]),
 "b35": ((35.6483,139.7001), ["ヒルサイドテラス", "代官山ヒルサイドテラス", "ヒルサイドテラスC棟"], ["ヒルサイドテラス", "代官山ヒルサイドテラス"]),
 "b36": ((35.6488,139.6994), ["代官山 蔦屋書店", "代官山T-SITE", "蔦屋書店 代官山"], ["代官山 蔦屋書店", "代官山T-SITE"]),
 "b37": ((35.6264,139.7745), ["フジテレビ本社ビル", "FCGビル", "フジテレビ"], ["FCGビル", "フジテレビ本社ビル"]),
 "b38": ((35.6499,139.7898), ["チームラボプラネッツ", "teamLab Planets TOKYO", "チームラボ プラネッツ TOKYO DMM"], ["チームラボプラネッツ", "チームラボプラネッツ TOKYO DMM.com"]),
}

def get(url):
    for attempt in range(3):
        try:
            r = subprocess.run(["curl", "-sS", "-m", "40", "-A", UA, "-H", "Accept-Language: ja", url],
                               capture_output=True, text=True)
            if r.returncode == 0 and r.stdout.strip():
                return json.loads(r.stdout)
            err = r.stderr.strip() or "empty"
        except Exception as e:  # JSON 오류 등
            err = repr(e)
        time.sleep(3 * (attempt + 1))
    return {"_error": err}

def q(s): return urllib.parse.quote(s)

def nominatim(query):
    url = ("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=4&bounded=1"
           f"&viewbox={VIEWBOX}&q={q(query)}")
    d = get(url); time.sleep(1.2)
    if isinstance(d, dict): return d
    return [{"lat": round(float(x["lat"]), 6), "lng": round(float(x["lon"]), 6),
             "osm": f'{x.get("osm_type","?")[0]}{x.get("osm_id")}',
             "cls": f'{x.get("category")}/{x.get("type")}', "name": x.get("name"),
             "disp": (x.get("display_name") or "")[:110],
             "bbox": [round(float(v), 5) for v in x.get("boundingbox", [])]} for x in d]

def wiki(lang, title):
    url = (f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
           f"&prop=coordinates|pageprops&ppprop=wikibase_item&coprop=type|name&colimit=10&titles={q(title)}")
    d = get(url); time.sleep(0.3)
    out = []
    for p in (d.get("query", {}).get("pages", {}) or {}).values():
        if "missing" in p: continue
        out.append({"title": p.get("title"), "qid": p.get("pageprops", {}).get("wikibase_item"),
                    "coords": [{"lat": c["lat"], "lng": c["lon"], "primary": "primary" in c, "name": c.get("name")}
                               for c in p.get("coordinates", [])]})
    return out or d.get("_error") or []

def wikidata_search(term):
    url = f"https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=ja&uselang=ja&limit=3&search={q(term)}"
    d = get(url); time.sleep(0.3)
    return [x["id"] for x in d.get("search", [])]

def wikidata_entities(ids):
    if not ids: return []
    url = ("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|descriptions|claims"
           f"&languages=ja|en&ids={'|'.join(ids)}")
    d = get(url); time.sleep(0.3)
    out = []
    for i, e in (d.get("entities") or {}).items():
        coords = []
        for c in e.get("claims", {}).get("P625", []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if v: coords.append({"lat": round(v["latitude"], 6), "lng": round(v["longitude"], 6)})
        out.append({"qid": i, "label": (e.get("labels", {}).get("ja") or e.get("labels", {}).get("en") or {}).get("value"),
                    "desc": (e.get("descriptions", {}).get("ja") or e.get("descriptions", {}).get("en") or {}).get("value"),
                    "coords": coords})
    return out

def gsi(term):
    d = get(f"https://msearch.gsi.go.jp/address-search/AddressSearch?q={q(term)}"); time.sleep(0.3)
    if isinstance(d, dict): return d
    out = []
    for x in d:
        lng, lat = x["geometry"]["coordinates"]
        if 35.55 <= lat <= 35.80 and 139.55 <= lng <= 139.95:
            out.append({"lat": round(lat, 6), "lng": round(lng, 6), "title": x["properties"].get("title")})
    return out[:4]

def main():
    res = {}
    for bid, (old, osm_q, wiki_q) in B.items():
        print(bid, osm_q[0], file=sys.stderr, flush=True)
        e = {"old": {"lat": old[0], "lng": old[1]}, "nominatim": {}, "jawiki": {}, "enwiki": {}, "wikidata": [], "gsi": {}}
        for s in osm_q: e["nominatim"][s] = nominatim(s)
        qids = []
        for t in wiki_q:
            e["jawiki"][t] = wiki("ja", t)
            for p in e["jawiki"][t] if isinstance(e["jawiki"][t], list) else []:
                if p.get("qid") and p["qid"] not in qids: qids.append(p["qid"])
            for i in wikidata_search(t):
                if i not in qids: qids.append(i)
        e["wikidata"] = wikidata_entities(qids[:8])
        e["gsi"][osm_q[0]] = gsi(osm_q[0])
        res[bid] = e
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
    print("done ->", OUT, file=sys.stderr)

if __name__ == "__main__":
    main()
