// 권역 약도에 쓰는 랜드마크(역·명소) 좌표와 이름표용 짧은 이름
//  landmarks : 출처는 OpenStreetMap(Nominatim 조회, 2026-11-16). src 에 객체 번호를 적었습니다.
//              '출입구 평균' 표시가 붙은 역은 역 점 객체를 못 찾아 같은 이름 출입구들의 평균이라 수십~100m 정도 어긋날 수 있습니다.
//  short     : 약도 이름표용 줄임말 (data.js 의 이름은 바꾸지 않고, 길 때만 줄여 씁니다)
window.SKETCH_DATA = {
 "landmarks": {
  "ueno": [
   {
    "id": "ueno_sta",
    "type": "station",
    "name": "우에노역",
    "lat": 35.7134128,
    "lng": 139.7765418,
    "src": "OSM 역 점(n236578444)"
   },
   {
    "id": "ueno_tnm",
    "type": "sight",
    "name": "도쿄국립박물관",
    "lat": 35.7190448,
    "lng": 139.7759676,
    "src": "OSM 건물(way/33439660)"
   },
   {
    "id": "ueno_akamon",
    "type": "sight",
    "name": "도쿄대 아카몬",
    "lat": 35.7106033,
    "lng": 139.7603542,
    "src": "OSM 명소(way/240891310)"
   }
  ],
  "asakusa": [
   {
    "id": "asakusa_sta",
    "type": "station",
    "name": "아사쿠사역",
    "lat": 35.7108423,
    "lng": 139.7978163,
    "src": "OSM 역 점(n6237151013)"
   },
   {
    "id": "asakusa_sensoji",
    "type": "sight",
    "name": "센소지",
    "lat": 35.7134032,
    "lng": 139.7955265,
    "src": "OSM 경내 면(way/173154847) 중심"
   },
   {
    "id": "asakusa_skytree",
    "type": "sight",
    "name": "도쿄 스카이트리",
    "lat": 35.7100543,
    "lng": 139.8107141,
    "src": "OSM(way/288269147)"
   }
  ],
  "marunouchi": [
   {
    "id": "yurakucho_sta",
    "type": "station",
    "name": "유라쿠초역",
    "lat": 35.6749572,
    "lng": 139.7630446,
    "src": "OSM 역 점(node/2558121955, JR)"
   },
   {
    "id": "nijubashi",
    "type": "sight",
    "name": "니주바시",
    "lat": 35.6802215,
    "lng": 139.7535986,
    "src": "OSM(way/43933152)"
   }
  ],
  "ginza": [
   {
    "id": "ginza_sta",
    "type": "station",
    "name": "긴자역",
    "lat": 35.671882,
    "lng": 139.764654,
    "src": "OSM 출입구 4곳(n1327305155 외) 평균 · 역 근처 대략 위치"
   },
   {
    "id": "kabukiza",
    "type": "sight",
    "name": "가부키자",
    "lat": 35.6696572,
    "lng": 139.7681111,
    "src": "OSM(relation/4859313)"
   }
  ],
  "azabudai_roppongi": [
   {
    "id": "roppongi_sta",
    "type": "station",
    "name": "롯폰기역",
    "lat": 35.663478,
    "lng": 139.732778,
    "src": "OSM 출입구 2곳(n1509876354, n2590478016) 평균 · 역 근처 대략 위치"
   },
   {
    "id": "tokyo_tower",
    "type": "sight",
    "name": "도쿄타워",
    "lat": 35.6584491,
    "lng": 139.745536,
    "src": "OSM(relation/4247312)"
   }
  ],
  "omotesando_aoyama": [
   {
    "id": "omotesando_sta",
    "type": "station",
    "name": "오모테산도역",
    "lat": 35.6652299,
    "lng": 139.7123934,
    "src": "OSM 역 점(node/6219132765)"
   },
   {
    "id": "okamoto_taro",
    "type": "sight",
    "name": "오카모토 타로 기념관",
    "lat": 35.6612724,
    "lng": 139.7155295,
    "src": "OSM(node/1966249089)"
   }
  ],
  "shibuya_harajuku": [
   {
    "id": "shibuya_sta",
    "type": "station",
    "name": "시부야역",
    "lat": 35.659062,
    "lng": 139.700865,
    "src": "OSM 출입구 3곳(n7092260266 외) 평균 · 역 근처 대략 위치"
   },
   {
    "id": "harajuku_sta",
    "type": "station",
    "name": "하라주쿠역",
    "lat": 35.6705019,
    "lng": 139.7024144,
    "src": "OSM 역 건물(w823006849) 중심"
   },
   {
    "id": "shibuya_crossing",
    "type": "sight",
    "name": "스크램블 교차로",
    "lat": 35.6594951,
    "lng": 139.7004982,
    "src": "OSM(way/1335178864)"
   }
  ],
  "yoyogi_shinjuku": [
   {
    "id": "shinjuku_sta",
    "type": "station",
    "name": "신주쿠역",
    "lat": 35.69033,
    "lng": 139.699785,
    "src": "OSM 역 점 5개(n6283384525 외) 평균"
   },
   {
    "id": "meiji_jingu",
    "type": "sight",
    "name": "메이지 신궁",
    "lat": 35.6748417,
    "lng": 139.6996266,
    "src": "OSM 경내 면(way/469908925) 중심"
   }
  ],
  "daikanyama_ebisu": [
   {
    "id": "daikanyama_sta",
    "type": "station",
    "name": "다이칸야마역",
    "lat": 35.648157,
    "lng": 139.703293,
    "src": "OSM 역 점(n3656056035)"
   },
   {
    "id": "ebisu_sta",
    "type": "station",
    "name": "에비스역",
    "lat": 35.646708,
    "lng": 139.709427,
    "src": "OSM 역 점 2개(n262449251, n2558121904) 평균"
   },
   {
    "id": "asakura",
    "type": "sight",
    "name": "구 아사쿠라가 주택",
    "lat": 35.6474357,
    "lng": 139.7007878,
    "src": "OSM(way/173226201)"
   }
  ],
  "toyosu_odaiba": [
   {
    "id": "toyosu_sta",
    "type": "station",
    "name": "도요스역",
    "lat": 35.65502,
    "lng": 139.796457,
    "src": "OSM 출입구 2곳(n1155821912, n1237991040) 평균 · 역 근처 대략 위치"
   },
   {
    "id": "odaiba_kaihinkoen_sta",
    "type": "station",
    "name": "오다이바카이힌코엔역",
    "lat": 35.6299058,
    "lng": 139.7788045,
    "src": "OSM 역 점(n3349902309)"
   }
  ]
 },
 "short": {
  "b03": "다이와 유비쿼터스",
  "b07": "아사히 맥주 본사",
  "b10": "미쓰비시 이치고칸",
  "b14": "긴자 식스",
  "b16": "하이에크 센터",
  "b17": "아자부다이 힐즈",
  "b24": "토즈 오모테산도",
  "b26": "스파이럴",
  "b36": "츠타야 티사이트"
 }
};
