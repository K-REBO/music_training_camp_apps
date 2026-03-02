export class StudioScheduler {
  constructor(bandsData) {
    this.bands = bandsData.bands;
    this.config = bandsData.config;
    this.schedule = Array(this.config.timeSlots).fill(null).map(() =>
      Array(this.config.rooms).fill(null)
    );

    // 楽器の優先順位 (移動が面倒な順)
    this.instrumentPriority = ['Key', 'DJ', 'Gt', 'Gt_1', 'Gt_2', 'Ba', 'Dr'];
  }

  // メンバーが重複していないかチェック
  hasConflict(timeSlot, room, band) {
    const currentMembers = new Set();

    // 同じ時間の他の部屋のメンバーを収集
    for (let r = 0; r < this.config.rooms; r++) {
      if (r === room) continue;
      const bandInRoom = this.schedule[timeSlot][r];
      if (bandInRoom) {
        Object.values(bandInRoom.members).forEach(member => {
          // UNKNOWNメンバーは重複チェック対象外
          if (member !== 'UNKNOWN') {
            currentMembers.add(member);
          }
        });
      }
    }

    // 配置予定のバンドのメンバーと重複チェック
    for (const member of Object.values(band.members)) {
      // UNKNOWNメンバーは重複チェック対象外
      if (member === 'UNKNOWN') {
        continue;
      }
      if (currentMembers.has(member)) {
        return true;
      }
    }

    return false;
  }

  // 楽器名を正規化（_数字を削除）
  normalizeInstrumentName(instrument) {
    return instrument.replace(/_\d+$/, '');
  }

  // 楽器の優先度を計算
  getInstrumentScore(band) {
    let score = 0;
    Object.keys(band.members).forEach(instrument => {
      const normalizedInstrument = this.normalizeInstrumentName(instrument);
      const priority = this.instrumentPriority.indexOf(normalizedInstrument);
      if (priority !== -1) {
        score += (this.instrumentPriority.length - priority) * 10;
      }
    });
    return score;
  }

  // バンドを楽器優先度でソート
  sortBandsByInstrumentPriority() {
    return [...this.bands].sort((a, b) => {
      return this.getInstrumentScore(b) - this.getInstrumentScore(a);
    });
  }

  // スケジュール配置
  generateSchedule() {
    const sortedBands = this.sortBandsByInstrumentPriority();
    const unscheduledBands = [];

    for (const band of sortedBands) {
      let placed = false;

      // 全ての時間x部屋の組み合わせを試行
      // 楽器優先順を考慮して、できるだけ縦（時間軸）で同じ部屋に配置を試行
      for (let room = 0; room < this.config.rooms && !placed; room++) {
        for (let timeSlot = 0; timeSlot < this.config.timeSlots && !placed; timeSlot++) {
          if (this.schedule[timeSlot][room] === null &&
              !this.hasConflict(timeSlot, room, band)) {
            this.schedule[timeSlot][room] = band;
            placed = true;
          }
        }
      }

      // 縦配置でだめなら横配置も試行
      if (!placed) {
        for (let timeSlot = 0; timeSlot < this.config.timeSlots && !placed; timeSlot++) {
          for (let room = 0; room < this.config.rooms && !placed; room++) {
            if (this.schedule[timeSlot][room] === null &&
                !this.hasConflict(timeSlot, room, band)) {
              this.schedule[timeSlot][room] = band;
              placed = true;
            }
          }
        }
      }

      if (!placed) {
        unscheduledBands.push(band);
      }
    }

    return {
      schedule: this.schedule,
      unscheduled: unscheduledBands
    };
  }

  // 配置結果をJSON形式で取得
  exportToJson() {
    const result = {
      config: this.config,
      schedule: this.schedule.map((timeSlot, timeIndex) => ({
        timeSlot: timeIndex + 1,
        rooms: timeSlot.map((band, roomIndex) => ({
          room: roomIndex + 1,
          band: band ? {
            name: band.name,
            members: band.members
          } : null
        }))
      })),
      timestamp: new Date().toISOString()
    };

    return result;
  }

  // 制約違反をチェック
  validateSchedule() {
    const result = {
      errors: [],
      warnings: []
    };

    for (let timeSlot = 0; timeSlot < this.config.timeSlots; timeSlot++) {
      const membersInTimeSlot = new Set();
      const memberToBandRoom = new Map();

      for (let room = 0; room < this.config.rooms; room++) {
        const band = this.schedule[timeSlot][room];
        if (band) {
          // 各バンドのユニークメンバーのみをチェック
          const uniqueMembers = [...new Set(Object.values(band.members))];

          uniqueMembers.forEach(member => {
            // UNKNOWNメンバーは重複チェック対象外
            if (member === 'UNKNOWN') {
              return;
            }

            if (membersInTimeSlot.has(member)) {
              const previousLocation = memberToBandRoom.get(member);
              // 横制約違反はWarningレベル
              result.warnings.push(`時間${timeSlot + 1}: ${member}が複数の部屋に重複配置されています (${previousLocation} と ${band.name}(Room${room + 1}))`);
            } else {
              membersInTimeSlot.add(member);
              memberToBandRoom.set(member, `${band.name}(Room${room + 1})`);
            }
          });
        }
      }
    }

    return result;
  }
}
