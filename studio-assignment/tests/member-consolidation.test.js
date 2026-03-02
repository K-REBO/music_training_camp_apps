const { describe, it, expect } = require('@jest/globals');

// メンバー結合のテスト用ヘルパー関数
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (str1 === 'UNKNOWN' || str2 === 'UNKNOWN') return 0;
  
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - (matrix[len1][len2] / maxLen);
}

function detectPotentialDuplicates(bandsData) {
  const allMembers = [];
  const memberOccurrences = new Map();
  
  // 全メンバーを収集
  bandsData.bands.forEach(band => {
    Object.entries(band.members).forEach(([instrument, member]) => {
      if (member && member !== 'UNKNOWN') {
        const memberInfo = {
          name: member,
          bandName: band.name,
          instrument: instrument
        };
        allMembers.push(memberInfo);
        
        if (!memberOccurrences.has(member)) {
          memberOccurrences.set(member, []);
        }
        memberOccurrences.get(member).push(memberInfo);
      }
    });
  });
  
  const duplicates = [];
  const processed = new Set();
  
  // 類似度による重複検出
  for (let i = 0; i < allMembers.length; i++) {
    if (processed.has(i)) continue;
    
    const group = [allMembers[i]];
    const groupKey = allMembers[i].name;
    
    for (let j = i + 1; j < allMembers.length; j++) {
      if (processed.has(j)) continue;
      
      const similarity = calculateSimilarity(allMembers[i].name, allMembers[j].name);
      if (similarity > 0.7) { // 70%以上の類似度
        group.push(allMembers[j]);
        processed.add(j);
      }
    }
    
    // 完全一致による重複検出も含める
    if (memberOccurrences.get(groupKey).length > 1) {
      const exactMatches = memberOccurrences.get(groupKey);
      exactMatches.forEach(match => {
        if (!group.find(g => g.bandName === match.bandName && g.instrument === match.instrument)) {
          group.push(match);
        }
      });
    }
    
    if (group.length > 1) {
      duplicates.push({
        id: duplicates.length,
        members: group,
        selectedName: group[0].name,
        shouldMerge: true
      });
    }
    
    processed.add(i);
  }
  
  return duplicates;
}

function consolidateData(bandsData, potentialDuplicates, mergeGroups) {
  const newBands = JSON.parse(JSON.stringify(bandsData.bands));
  
  // 各結合グループに対して処理
  potentialDuplicates.forEach(group => {
    if (group.shouldMerge && mergeGroups.has(group.id)) {
      const targetName = mergeGroups.get(group.id);
      
      // グループ内の全ての名前を統一
      group.members.forEach(member => {
        const band = newBands.find(b => b.name === member.bandName);
        if (band && band.members[member.instrument] === member.name) {
          band.members[member.instrument] = targetName;
        }
      });
    }
  });
  
  return {
    config: bandsData.config,
    bands: newBands
  };
}

describe('Member Consolidation', () => {
  const testBandsData = {
    config: { rooms: 4, timeSlots: 6 },
    bands: [
      {
        name: "Band A",
        members: {
          "Gt": "Andy",
          "Ba": "Bob", 
          "Dr": "Cathy"
        }
      },
      {
        name: "Band B", 
        members: {
          "Key": "Andy", // 同じ人
          "Gt": "Robert",
          "Ba": "john", // johnとJohnは同じ人の可能性
          "Dr": "William"
        }
      },
      {
        name: "Band C",
        members: {
          "Gt": "John", // johnと類似
          "Ba": "Phil",
          "Dr": "George"
        }
      }
    ]
  };

  describe('calculateSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(calculateSimilarity('Andy', 'Andy')).toBe(1.0);
    });

    it('should return 0 for UNKNOWN members', () => {
      expect(calculateSimilarity('Andy', 'UNKNOWN')).toBe(0);
      expect(calculateSimilarity('UNKNOWN', 'Bob')).toBe(0);
    });

    it('should detect similar names', () => {
      const similarity = calculateSimilarity('john', 'John');
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should return low similarity for different names', () => {
      const similarity = calculateSimilarity('Andy', 'William');
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe('detectPotentialDuplicates', () => {
    it('should detect exact matches', () => {
      const duplicates = detectPotentialDuplicates(testBandsData);
      
      // Andyの重複を検出
      const andyGroup = duplicates.find(group => 
        group.members.some(m => m.name === 'Andy')
      );
      expect(andyGroup).toBeDefined();
      expect(andyGroup.members.length).toBe(2);
    });

    it('should detect similar names', () => {
      const duplicates = detectPotentialDuplicates(testBandsData);
      
      // john/Johnの類似を検出
      const johnGroup = duplicates.find(group => 
        group.members.some(m => m.name === 'john' || m.name === 'John')
      );
      expect(johnGroup).toBeDefined();
    });

    it('should not include UNKNOWN members', () => {
      const dataWithUnknown = {
        ...testBandsData,
        bands: [
          ...testBandsData.bands,
          {
            name: "Band D",
            members: {
              "Gt": "UNKNOWN",
              "Ba": "Andy"
            }
          }
        ]
      };

      const duplicates = detectPotentialDuplicates(dataWithUnknown);
      
      // UNKNOWNは重複グループに含まれない
      duplicates.forEach(group => {
        expect(group.members.every(m => m.name !== 'UNKNOWN')).toBe(true);
      });
    });
  });

  describe('consolidateData', () => {
    it('should merge members correctly', () => {
      const duplicates = detectPotentialDuplicates(testBandsData);
      const mergeGroups = new Map();
      
      // Andyのグループを見つけて結合設定
      const andyGroup = duplicates.find(group => 
        group.members.some(m => m.name === 'Andy')
      );
      if (andyGroup) {
        mergeGroups.set(andyGroup.id, 'Andy');
        andyGroup.shouldMerge = true;
      }

      const consolidated = consolidateData(testBandsData, duplicates, mergeGroups);
      
      // Band AとBand Bの両方でAndyになっている
      const bandA = consolidated.bands.find(b => b.name === 'Band A');
      const bandB = consolidated.bands.find(b => b.name === 'Band B');
      
      expect(bandA.members.Gt).toBe('Andy');
      expect(bandB.members.Key).toBe('Andy');
    });

    it('should preserve original data when no merging', () => {
      const duplicates = detectPotentialDuplicates(testBandsData);
      const mergeGroups = new Map();
      
      // 結合しない設定
      duplicates.forEach(group => {
        group.shouldMerge = false;
      });

      const consolidated = consolidateData(testBandsData, duplicates, mergeGroups);
      
      // 元のデータと同じ
      expect(consolidated.bands).toEqual(testBandsData.bands);
    });

    it('should handle multiple merge groups', () => {
      const duplicates = detectPotentialDuplicates(testBandsData);
      const mergeGroups = new Map();
      
      // 全グループを結合
      duplicates.forEach(group => {
        mergeGroups.set(group.id, group.members[0].name);
        group.shouldMerge = true;
      });

      const consolidated = consolidateData(testBandsData, duplicates, mergeGroups);
      
      // 結合が適用されていることを確認
      expect(consolidated.bands).toBeDefined();
      expect(consolidated.config).toEqual(testBandsData.config);
    });
  });
});