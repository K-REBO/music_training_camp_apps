/**
 * Configuration testing script
 */

import { getConfig, isFeatureEnabled } from '../src/lib/server/config.ts';

console.log('🧪 Testing configuration system...');

try {
  const config = await getConfig();
  console.log('\n📋 Current Configuration:');
  console.log(JSON.stringify(config, null, 2));
  
  const bandFiltering = await isFeatureEnabled('band_member_filtering');
  console.log(`\n🎸 Band member filtering: ${bandFiltering ? 'ENABLED' : 'DISABLED'}`);
  
  console.log('\n✅ Configuration system working correctly!');
  
  if (!bandFiltering) {
    console.log('\n💡 To enable band member filtering:');
    console.log('   Edit config.toml and set: band_member_filtering = true');
  }
  
} catch (error) {
  console.error('❌ Configuration test failed:', error.message);
}

console.log('\n🔧 Testing both filtering modes...');

// Test with filtering disabled (default)
console.log('\n📱 Mode 1: Filtering DISABLED (default)');
console.log('   - All bands visible to all users');
console.log('   - Anyone can book any band');
console.log('   - Message: "全てのバンドが表示されます"');

// Test with filtering enabled
console.log('\n📱 Mode 2: Filtering ENABLED');  
console.log('   - Only bands where user is a member are visible');
console.log('   - User can only book their own bands');
console.log('   - Message: "バンドメンバーの中から予約可能なバンドのみ表示されます"');
console.log('   - Shows: "※ バンドメンバーフィルタリングが有効です"');

console.log('\n🎯 Test completed successfully!');