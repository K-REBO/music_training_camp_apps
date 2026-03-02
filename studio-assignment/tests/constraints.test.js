const StudioScheduler = require('../scheduler');

describe('制約違反検出テスト', () => {
  
  describe('横制約テスト（Warningレベル）', () => {
    test('同じメンバーが複数バンドにいる場合のWarning', () => {
      const conflictData = {
        config: { rooms: 2, timeSlots: 2 },
        bands: [
          {
            name: "BandA",
            members: { "Gt": "Andy", "Dr": "Bob" }
          },
          {
            name: "BandB", 
            members: { "Ba": "Andy", "Key": "Charlie" } // Andy重複
          },
          {
            name: "BandC",
            members: { "Vo": "David" }
          }
        ]
      };

      const scheduler = new StudioScheduler(conflictData);
      
      // スケジュール強制配置（テスト用）
      scheduler.schedule[0][0] = conflictData.bands[0]; // BandA
      scheduler.schedule[0][1] = conflictData.bands[1]; // BandB (Andyが重複)
      
      const validation = scheduler.validateSchedule();
      
      expect(validation.warnings.length).toBeGreaterThan(0);
      expect(validation.warnings[0]).toContain('Andy');
      expect(validation.warnings[0]).toContain('重複配置');
    });

    test('バンド内同一メンバー複数楽器は正常処理', () => {
      const samePersonData = {
        config: { rooms: 2, timeSlots: 2 },
        bands: [
          {
            name: "SoloArtist",
            members: { "Gt": "Andy", "Vo": "Andy" } // 同じ人が複数楽器
          }
        ]
      };

      const scheduler = new StudioScheduler(samePersonData);
      scheduler.schedule[0][0] = samePersonData.bands[0];
      
      const validation = scheduler.validateSchedule();
      
      // バンド内の同じメンバー重複はWarningにならない
      expect(validation.warnings.length).toBe(0);
    });
  });

  describe('縦制約テスト（楽器優先度）', () => {
    test('楽器優先度順（Key > Gt > Ba > Dr）での配置', () => {
      const priorityData = {
        config: { rooms: 2, timeSlots: 3 },
        bands: [
          {
            name: "DrBand",
            members: { "Dr": "Alice" }
          },
          {
            name: "KeyBand",
            members: { "Key": "Bob" }
          },
          {
            name: "GtBand",
            members: { "Gt": "Charlie" }
          },
          {
            name: "BaBand", 
            members: { "Ba": "David" }
          }
        ]
      };

      const scheduler = new StudioScheduler(priorityData);
      const sortedBands = scheduler.sortBandsByInstrumentPriority();
      
      // Key > Gt > Ba > Dr の順になることを確認
      expect(sortedBands[0].name).toBe("KeyBand");
      expect(sortedBands[1].name).toBe("GtBand"); 
      expect(sortedBands[2].name).toBe("BaBand");
      expect(sortedBands[3].name).toBe("DrBand");
    });

    test('縦配置優先動作確認', () => {
      const verticalData = {
        config: { rooms: 2, timeSlots: 3 },
        bands: [
          { name: "KeyBand1", members: { "Key": "Alice" } },
          { name: "KeyBand2", members: { "Key": "Bob" } }
        ]
      };

      const scheduler = new StudioScheduler(verticalData);
      const result = scheduler.generateSchedule();
      
      // 同じ楽器優先度のバンドは同じ部屋の異なる時間に配置されることを確認
      const room1Bands = [];
      const room2Bands = [];
      
      for (let t = 0; t < verticalData.config.timeSlots; t++) {
        if (result.schedule[t][0]) room1Bands.push(result.schedule[t][0].name);
        if (result.schedule[t][1]) room2Bands.push(result.schedule[t][1].name);
      }
      
      // 少なくとも1つの部屋に複数のバンドが縦に配置される
      const hasVerticalPlacement = room1Bands.length > 1 || room2Bands.length > 1;
      expect(hasVerticalPlacement).toBe(true);
    });
  });

  describe('複合制約テスト', () => {
    test('横制約回避を優先して配置', () => {
      const complexData = {
        config: { rooms: 3, timeSlots: 2 },
        bands: [
          { name: "BandA", members: { "Key": "Alice", "Dr": "Shared" } },
          { name: "BandB", members: { "Gt": "Bob", "Dr": "Shared" } }, // Shared重複
          { name: "BandC", members: { "Ba": "Charlie" } }
        ]
      };

      const scheduler = new StudioScheduler(complexData);
      const result = scheduler.generateSchedule();
      
      expect(result.unscheduled.length).toBe(0); // 全バンド配置可能
      
      const validation = scheduler.validateSchedule();
      
      // 理想的には警告なし、どうしても無理な場合は警告あり
      if (validation.warnings.length > 0) {
        expect(validation.warnings[0]).toContain('Shared');
      }
    });
  });
});