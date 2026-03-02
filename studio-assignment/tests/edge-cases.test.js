const StudioScheduler = require('../scheduler');

describe('エッジケーステスト', () => {
  
  describe('想定範囲内ケース（バンド数 > 部屋数 && バンド数 < 部屋数*時間枠数）', () => {
    test('部屋数3、時間枠4、バンド数8 - 全配置可能', () => {
      const inRangeData = {
        config: { rooms: 3, timeSlots: 4 }, // 3*4=12 > 8
        bands: Array.from({length: 8}, (_, i) => ({
          name: `Band${i + 1}`,
          members: { "Gt": `Member${i + 1}` }
        }))
      };

      const scheduler = new StudioScheduler(inRangeData);
      const result = scheduler.generateSchedule();
      
      expect(result.unscheduled.length).toBe(0); // 全バンド配置可能
      expect(8).toBeGreaterThan(3); // バンド数 > 部屋数
      expect(8).toBeLessThan(3 * 4); // バンド数 < 部屋数*時間枠数
    });

    test('部屋数2、時間枠3、バンド数5 - 全配置可能', () => {
      const inRangeData = {
        config: { rooms: 2, timeSlots: 3 }, // 2*3=6 > 5
        bands: Array.from({length: 5}, (_, i) => ({
          name: `Band${i + 1}`,
          members: { "Ba": `Member${i + 1}` }
        }))
      };

      const scheduler = new StudioScheduler(inRangeData);
      const result = scheduler.generateSchedule();
      
      expect(result.unscheduled.length).toBe(0);
      expect(5).toBeGreaterThan(2);
      expect(5).toBeLessThan(2 * 3);
    });
  });

  describe('想定範囲外ケース', () => {
    test('バンド数 > 部屋数*時間枠数 - 配置不可バンドあり', () => {
      const overCapacityData = {
        config: { rooms: 2, timeSlots: 3 }, // 2*3=6
        bands: Array.from({length: 7}, (_, i) => ({ // 7 > 6
          name: `Band${i + 1}`,
          members: { "Dr": `Member${i + 1}` }
        }))
      };

      const scheduler = new StudioScheduler(overCapacityData);
      const result = scheduler.generateSchedule();
      
      expect(result.unscheduled.length).toBeGreaterThan(0); // 配置不可バンドあり
      expect(7).toBeGreaterThan(2 * 3);
    });

    test('バンド数 <= 部屋数 - 余裕すぎるケース', () => {
      const underCapacityData = {
        config: { rooms: 4, timeSlots: 3 },
        bands: [
          { name: "LonelyBand1", members: { "Key": "Alice" } },
          { name: "LonelyBand2", members: { "Gt": "Bob" } },
          { name: "LonelyBand3", members: { "Ba": "Charlie" } }
        ] // 3 <= 4
      };

      const scheduler = new StudioScheduler(underCapacityData);
      const result = scheduler.generateSchedule();
      
      expect(result.unscheduled.length).toBe(0); // 全配置可能
      expect(3).toBeLessThanOrEqual(4); // バンド数 <= 部屋数
      
      // 全バンドが配置されていることを確認（どの時間でも可）
      const allScheduledBands = [];
      for (let t = 0; t < underCapacityData.config.timeSlots; t++) {
        for (let r = 0; r < underCapacityData.config.rooms; r++) {
          if (result.schedule[t][r]) {
            allScheduledBands.push(result.schedule[t][r].name);
          }
        }
      }
      expect(allScheduledBands.length).toBe(3);
    });
  });

  describe('複雑なメンバー重複ケース', () => {
    test('1人が3つのバンドに所属 - 時間分散配置', () => {
      const multiMembershipData = {
        config: { rooms: 2, timeSlots: 3 },
        bands: [
          { name: "BandA", members: { "Key": "Andy", "Dr": "Alice" } },
          { name: "BandB", members: { "Gt": "Andy", "Ba": "Bob" } },
          { name: "BandC", members: { "Vo": "Andy", "Dr": "Charlie" } }
        ]
      };

      const scheduler = new StudioScheduler(multiMembershipData);
      const result = scheduler.generateSchedule();
      
      // Andyがいるバンドは同じ時間に配置されない（理想）
      const andyBands = ["BandA", "BandB", "BandC"];
      const timeSlotUsage = new Map();
      
      for (let t = 0; t < 3; t++) {
        for (let r = 0; r < 2; r++) {
          const band = result.schedule[t][r];
          if (band && andyBands.includes(band.name)) {
            if (!timeSlotUsage.has(t)) {
              timeSlotUsage.set(t, []);
            }
            timeSlotUsage.get(t).push(band.name);
          }
        }
      }
      
      // 各時間枠でAndyがいるバンドは最大1つ（理想的には）
      const validation = scheduler.validateSchedule();
      if (validation.warnings.length > 0) {
        // 警告が出る場合は、Andyに関する警告であることを確認
        expect(validation.warnings.some(w => w.includes('Andy'))).toBe(true);
      }
    });

    test('メンバー重複が多い複雑ケース', () => {
      const complexOverlapData = {
        config: { rooms: 3, timeSlots: 4 },
        bands: [
          { name: "Band1", members: { "Key": "A", "Gt": "B", "Ba": "C" } },
          { name: "Band2", members: { "Gt": "B", "Ba": "C", "Dr": "D" } }, // B,C重複
          { name: "Band3", members: { "Ba": "C", "Dr": "D", "Key": "E" } }, // C,D重複
          { name: "Band4", members: { "Dr": "D", "Key": "E", "Vo": "F" } }, // D,E重複
          { name: "Band5", members: { "Vo": "G", "Gt": "H" } } // 重複なし
        ]
      };

      const scheduler = new StudioScheduler(complexOverlapData);
      const result = scheduler.generateSchedule();
      
      // 全バンド配置可能（5 < 3*4=12）
      expect(result.unscheduled.length).toBe(0);
      
      const validation = scheduler.validateSchedule();
      // 複雑な重複により警告が出る可能性が高い
      if (validation.warnings.length > 0) {
        console.log('複雑な重複による警告:', validation.warnings);
      }
    });
  });

  describe('境界値テスト', () => {
    test('最小構成 - 部屋数1、時間枠1、バンド数1', () => {
      const minimalData = {
        config: { rooms: 1, timeSlots: 1 },
        bands: [
          { name: "SoloBand", members: { "Gt": "Alice" } }
        ]
      };

      const scheduler = new StudioScheduler(minimalData);
      const result = scheduler.generateSchedule();
      
      expect(result.unscheduled.length).toBe(0);
      expect(result.schedule[0][0]).toEqual(minimalData.bands[0]);
    });

    test('空のバンド配列', () => {
      const emptyData = {
        config: { rooms: 3, timeSlots: 3 },
        bands: []
      };

      const scheduler = new StudioScheduler(emptyData);
      const result = scheduler.generateSchedule();
      
      expect(result.unscheduled.length).toBe(0);
      expect(result.schedule.every(timeSlot => 
        timeSlot.every(room => room === null)
      )).toBe(true);
    });

    test('メンバーが空のバンド', () => {
      const emptyMembersData = {
        config: { rooms: 2, timeSlots: 2 },
        bands: [
          { name: "EmptyBand", members: {} },
          { name: "NormalBand", members: { "Gt": "Alice" } }
        ]
      };

      const scheduler = new StudioScheduler(emptyMembersData);
      const result = scheduler.generateSchedule();
      
      // 空のバンドも配置される
      expect(result.unscheduled.length).toBe(0);
      
      const validation = scheduler.validateSchedule();
      expect(validation.warnings.length).toBe(0); // メンバーなしなので重複なし
    });
  });

  describe('大規模データテスト', () => {
    test('部屋数10、時間枠8、バンド数70 - 性能テスト', () => {
      const largeData = {
        config: { rooms: 10, timeSlots: 8 }, // 10*8=80 > 70
        bands: Array.from({length: 70}, (_, i) => ({
          name: `LargeBand${i + 1}`,
          members: {
            "Gt": `Guitarist${i + 1}`,
            "Ba": `Bassist${i + 1}`,
            "Dr": `Drummer${i + 1}`
          }
        }))
      };

      const scheduler = new StudioScheduler(largeData);
      const startTime = Date.now();
      const result = scheduler.generateSchedule();
      const endTime = Date.now();
      
      expect(result.unscheduled.length).toBe(0); // 全配置可能
      expect(endTime - startTime).toBeLessThan(5000); // 5秒以内
      
      const validation = scheduler.validateSchedule();
      expect(validation.warnings.length).toBe(0); // メンバー重複なし
    });
  });
});