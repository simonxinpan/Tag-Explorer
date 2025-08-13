// 文件路径: lib/auth.js

/**
 * 验证API密钥
 * @param {Object} req - 请求对象
 * @returns {Object} 验证结果
 */
export function verifyApiKey(req) {
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.CRON_SECRET || 'test-secret';
  
  if (!authHeader) {
    return {
      success: false,
      error: 'Missing authorization header'
    };
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  if (token !== expectedKey) {
    return {
      success: false,
      error: 'Invalid API key'
    };
  }
  
  return {
    success: true
  };
}