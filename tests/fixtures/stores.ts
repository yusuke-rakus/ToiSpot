import { geohashForLocation } from 'geofire-common'
import {
  storeDocumentSchema,
  type StoreDocument,
} from '../../src/features/stores/store-schema.ts'

export function createTestStores(
  timestamp: string,
): Array<{ id: string; data: StoreDocument }> {
  const definitions = [
    {
      name: '丸の内中央店',
      lat: 35.6818,
      lng: 139.764,
      area: '千代田区丸の内周辺',
      availability: 'available',
      genderLayout: 'shared',
      stalls: { male: 0, female: 0, shared: 2 },
      urinals: 0,
      conditions: '特に条件なし（架空設定）',
    },
    {
      name: '八重洲東口店',
      lat: 35.6805,
      lng: 139.7713,
      area: '中央区八重洲周辺',
      availability: 'conditional',
      genderLayout: 'separate',
      stalls: { male: 1, female: 1, shared: 0 },
      urinals: 1,
      conditions: '商品購入後、スタッフに声をかけてください（架空設定）',
    },
    {
      name: '大手町北店',
      lat: 35.6855,
      lng: 139.7643,
      area: '千代田区大手町周辺',
      availability: 'unavailable',
      genderLayout: 'unknown',
      stalls: { male: 0, female: 0, shared: 0 },
      urinals: 0,
      conditions: 'トイレの貸出を行っていません（架空設定）',
    },
    {
      name: '日本橋西店',
      lat: 35.6839,
      lng: 139.7738,
      area: '中央区日本橋周辺',
      availability: 'temporarily_unavailable',
      genderLayout: 'shared',
      stalls: { male: 0, female: 0, shared: 1 },
      urinals: 0,
      conditions: '設備点検のため一時停止中（架空設定）',
    },
    {
      name: '京橋南店',
      lat: 35.6768,
      lng: 139.7706,
      area: '中央区京橋周辺',
      availability: 'unknown',
      genderLayout: 'unknown',
      stalls: { male: null, female: null, shared: null },
      urinals: null,
      conditions: '利用条件は未確認です',
    },
    {
      name: '有楽町駅前店',
      lat: 35.6752,
      lng: 139.7639,
      area: '千代田区有楽町周辺',
      availability: 'available',
      genderLayout: 'mixed',
      stalls: { male: 1, female: 1, shared: 1 },
      urinals: 0,
      conditions: '特に条件なし（架空設定）',
    },
  ]
  return definitions.map((item, index) => {
    const location = { lat: item.lat, lng: item.lng }
    return {
      id: `sample-tokyo-${String(index + 1).padStart(2, '0')}`,
      data: storeDocumentSchema.parse({
        googlePlaceId: `ChIJ_fixture_${index + 1}`,
        name: `サンプルコンビニ ${item.name}`,
        chainName: 'サンプルコンビニ',
        address: `東京都${item.area}（架空の店舗）`,
        location,
        geohash: geohashForLocation([location.lat, location.lng]),
        availability: item.availability,
        genderLayout: item.genderLayout,
        stalls: item.stalls,
        urinals: item.urinals,
        conditions: item.conditions,
        notes:
          '表示確認用の架空データです。実在する店舗の設備情報ではありません。',
        lastConfirmedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        isSample: false,
      }),
    }
  })
}
