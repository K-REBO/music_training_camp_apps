#!/usr/bin/env node

const fs = require('fs');
const StudioScheduler = require('./scheduler');

function main() {
  try {
    // band.jsonを読み込み
    const bandsData = JSON.parse(fs.readFileSync('band.json', 'utf8'));
    
    console.log('=== 合宿スタジオ配置システム ===');
    console.log(`設定: ${bandsData.config.rooms}部屋 × ${bandsData.config.timeSlots}時間枠`);
    console.log(`バンド数: ${bandsData.bands.length}`);
    
    // スケジューラーを初期化
    const scheduler = new StudioScheduler(bandsData);
    
    // スケジュール生成
    console.log('\nスケジュールを生成中...');
    const result = scheduler.generateSchedule();
    
    // バンド別メンバー情報を表示
    console.log('\n=== バンド別メンバー情報 ===');
    bandsData.bands.forEach(band => {
      const members = Object.values(band.members);
      const uniqueMembers = [...new Set(members)];
      console.log(`${band.name}: ${uniqueMembers.join(', ')} (${members.length}人 -> ${uniqueMembers.length}ユニーク)`);
    });

    // 結果を表示
    scheduler.printSchedule();
    
    // 制約違反チェック
    const validation = scheduler.validateSchedule();
    
    if (validation.errors.length > 0) {
      console.log('❌ エラーが検出されました:');
      validation.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (validation.warnings.length > 0) {
      console.log('⚠️  警告が検出されました:');
      validation.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
    
    if (validation.errors.length === 0 && validation.warnings.length === 0) {
      console.log('✅ 制約チェック: すべて満たされています');
    }
    
    // 配置できなかったバンドを表示
    if (result.unscheduled.length > 0) {
      console.log('\n❌ 配置できなかったバンド:');
      result.unscheduled.forEach(band => {
        console.log(`  - ${band.name}`);
      });
    }
    
    // JSONファイルに出力
    scheduler.exportToJson();
    
  } catch (error) {
    console.error('エラーが発生しました:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}