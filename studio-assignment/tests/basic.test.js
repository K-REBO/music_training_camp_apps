const StudioScheduler = require('../scheduler');

describe('基本機能テスト', () => {
  const basicBandData = {
    config: { rooms: 3, timeSlots: 4 },
    bands: [
      {
        name: "KeyBand",
        members: { "Key": "Alice" } // Keyのみで最高スコア
      },
      {
        name: "GtBand", 
        members: { "Gt": "Charlie", "Ba": "David" } // Gt + Ba
      },
      {
        name: "BaBand",
        members: { "Ba": "Eve", "Dr": "Frank" } // Ba + Dr
      }
    ]
  };

  test('バンドデータの正常読み込み', () => {
    const scheduler = new StudioScheduler(basicBandData);
    expect(scheduler.bands).toHaveLength(3);
    expect(scheduler.config.rooms).toBe(3);
    expect(scheduler.config.timeSlots).toBe(4);
  });

  test('楽器優先度ソート機能', () => {
    const scheduler = new StudioScheduler(basicBandData);
    const sortedBands = scheduler.sortBandsByInstrumentPriority();
    
    // スコア順: GtBand(70) > KeyBand(60) > BaBand(30)
    expect(sortedBands[0].name).toBe("GtBand");
    expect(sortedBands[1].name).toBe("KeyBand");
    expect(sortedBands[2].name).toBe("BaBand");
  });

  test('楽器優先度スコア計算', () => {
    const scheduler = new StudioScheduler(basicBandData);
    
    const keyBandScore = scheduler.getInstrumentScore(basicBandData.bands[0]); // Key only
    const gtBandScore = scheduler.getInstrumentScore(basicBandData.bands[1]);  // Gt + Ba  
    const baBandScore = scheduler.getInstrumentScore(basicBandData.bands[2]);  // Ba + Dr
    
    console.log('Scores:', { keyBandScore, gtBandScore, baBandScore });
    
    // 実際のスコア: Key(60) < Gt+Ba(70), Gt+Ba(70) > Ba+Dr(30)
    expect(gtBandScore).toBeGreaterThan(keyBandScore); // 楽器数が多いほうが高スコア
    expect(gtBandScore).toBeGreaterThan(baBandScore);
    expect(keyBandScore).toBeGreaterThan(baBandScore); // Key単体 > Ba+Dr
  });

  test('スケジュール生成の基本動作', () => {
    const scheduler = new StudioScheduler(basicBandData);
    const result = scheduler.generateSchedule();
    
    expect(result.schedule).toBeDefined();
    expect(result.unscheduled).toBeDefined();
    expect(result.schedule).toHaveLength(4); // timeSlots
    expect(result.schedule[0]).toHaveLength(3); // rooms
  });

  test('全バンドが配置可能（想定範囲内）', () => {
    // バンド数3 > 部屋数3 ではないが、3 < 3*4=12 なので全配置可能
    const scheduler = new StudioScheduler(basicBandData);
    const result = scheduler.generateSchedule();
    
    expect(result.unscheduled).toHaveLength(0);
  });

  test('JSON出力機能', () => {
    const scheduler = new StudioScheduler(basicBandData);
    scheduler.generateSchedule();
    
    const result = scheduler.exportToJson('test-output.json');
    expect(result.config).toEqual(basicBandData.config);
    expect(result.schedule).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });
});

describe('スケジュール構造テスト', () => {
  test('スケジュール配列の構造確認', () => {
    const scheduler = new StudioScheduler({
      config: { rooms: 2, timeSlots: 3 },
      bands: [
        { name: "TestBand", members: { "Gt": "Alice" } }
      ]
    });
    
    const result = scheduler.generateSchedule();
    
    // 3時間枠 x 2部屋の構造
    expect(result.schedule).toHaveLength(3);
    result.schedule.forEach(timeSlot => {
      expect(timeSlot).toHaveLength(2);
    });
  });
});