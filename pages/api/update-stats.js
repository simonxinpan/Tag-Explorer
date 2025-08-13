import Database from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const updateStats = await Database.getUpdateStats();
    
    res.status(200).json({
      success: true,
      data: updateStats
    });
  } catch (error) {
    console.error('获取更新统计失败:', error);
    res.status(500).json({ 
      success: false,
      error: '获取更新统计失败' 
    });
  }
}