/**
 * AI图像生成服务
 * 调用图像编辑API进行AI图像生成
 */

const API_BASE_URL = 'https://api.ppinfra.com/v1'
const API_ENDPOINT = `${API_BASE_URL}/images/edits`

class AIImageService {
  constructor() {
    // API密钥，实际使用时应该从环境变量或配置文件中获取
    this.apiKey = import.meta.env.VITE_AI_API_KEY || ''
  }

  /**
   * 设置API密钥
   * @param {string} apiKey - API密钥
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey
  }

  /**
   * 生成图像
   * @param {Object} params - 生成参数
   * @param {Blob} params.image - 输入图像文件
   * @param {string} params.prompt - 描述词
   * @param {string} params.quality - 图像质量 (auto, high, medium, low)
   * @param {Object} params.outputSize - 输出尺寸 {width, height}
   * @param {Function} onProgress - 进度回调函数
   * @returns {Promise<Object>} - 生成结果
   */
  async generateImage(params, onProgress = null) {
    const { image, prompt, quality = 'auto', outputSize } = params

    if (!this.apiKey) {
      throw new Error('API密钥未设置，请先设置API密钥')
    }

    if (!image) {
      throw new Error('必须提供输入图像')
    }

    if (!prompt || !prompt.trim()) {
      throw new Error('必须提供描述词')
    }

    try {
      // 创建FormData
      const formData = new FormData()
      
      // 添加模型参数
      formData.append('model', 'gpt-image-1')
      
      // 添加图像文件
      formData.append('image', image, 'input.png')
      
      // 添加描述词
      formData.append('prompt', prompt.trim())
      
      // 添加质量参数
      formData.append('quality', quality)

      // 调用进度回调
      if (onProgress) {
        onProgress({ stage: 'uploading', progress: 0, message: '上传图像中...' })
      }

      // 发送请求
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          // 注意：不要设置Content-Type，让浏览器自动设置multipart/form-data边界
        },
        body: formData
      })

      // 调用进度回调
      if (onProgress) {
        onProgress({ stage: 'processing', progress: 50, message: 'AI处理中...' })
      }

      // 检查响应状态
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`API请求失败: ${response.status} ${response.statusText}${errorData.error ? ' - ' + errorData.error.message : ''}`)
      }

      // 解析响应
      const result = await response.json()

      // 调用进度回调
      if (onProgress) {
        onProgress({ stage: 'completed', progress: 100, message: '生成完成' })
      }

      // 验证响应格式
      if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
        throw new Error('API响应格式错误：缺少生成的图像数据')
      }

      // 处理生成的图像
      const generatedImages = result.data.map((item, index) => {
        if (!item.b64_json) {
          throw new Error(`生成的图像${index + 1}缺少b64_json数据`)
        }

        // 转换base64为blob URL
        const imageData = item.b64_json
        const binaryString = atob(imageData)
        const bytes = new Uint8Array(binaryString.length)
        
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        
        const blob = new Blob([bytes], { type: 'image/png' })
        const imageUrl = URL.createObjectURL(blob)

        return {
          url: imageUrl,
          blob: blob,
          base64: imageData
        }
      })

      return {
        success: true,
        images: generatedImages,
        usage: result.usage || {},
        created: result.created || Date.now(),
        metadata: {
          prompt,
          quality,
          outputSize,
          timestamp: new Date().toISOString()
        }
      }

    } catch (error) {
      console.error('AI图像生成失败:', error)
      
      // 调用进度回调报告错误
      if (onProgress) {
        onProgress({ 
          stage: 'error', 
          progress: 0, 
          message: `生成失败: ${error.message}` 
        })
      }

      // 重新抛出错误以便调用方处理
      throw error
    }
  }

  /**
   * 验证API密钥
   * @returns {Promise<boolean>} - 验证结果
   */
  async validateApiKey() {
    if (!this.apiKey) {
      return false
    }

    try {
      // 创建一个最小的测试请求
      const testFormData = new FormData()
      const testBlob = new Blob(['test'], { type: 'image/png' })
      
      testFormData.append('model', 'gpt-image-1')
      testFormData.append('image', testBlob, 'test.png')
      testFormData.append('prompt', 'test')

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: testFormData
      })

      // 如果返回401，说明API密钥无效
      // 如果返回其他错误（如400），说明API密钥有效但请求参数有问题
      return response.status !== 401

    } catch (error) {
      console.error('API密钥验证失败:', error)
      return false
    }
  }

  /**
   * 检查API服务状态
   * @returns {Promise<Object>} - 服务状态信息
   */
  async checkServiceStatus() {
    try {
      const response = await fetch(API_BASE_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      })

      return {
        available: response.ok,
        status: response.status,
        statusText: response.statusText
      }

    } catch (error) {
      return {
        available: false,
        error: error.message
      }
    }
  }

  /**
   * 获取支持的模型列表
   * @returns {Array} - 支持的模型列表
   */
  getSupportedModels() {
    return ['gpt-image-1']
  }

  /**
   * 获取支持的质量选项
   * @returns {Array} - 支持的质量选项
   */
  getSupportedQualities() {
    return [
      { value: 'auto', label: '自动' },
      { value: 'high', label: '高质量' },
      { value: 'medium', label: '中等质量' },
      { value: 'low', label: '低质量' }
    ]
  }

  /**
   * 获取推荐的图像尺寸
   * @returns {Array} - 推荐的尺寸选项
   */
  getRecommendedSizes() {
    return [
      { value: '512x512', label: '512×512 (正方形)', width: 512, height: 512 },
      { value: '768x512', label: '768×512 (横向)', width: 768, height: 512 },
      { value: '512x768', label: '512×768 (纵向)', width: 512, height: 768 },
      { value: '1024x1024', label: '1024×1024 (高清正方形)', width: 1024, height: 1024 },
      { value: '1024x768', label: '1024×768 (高清横向)', width: 1024, height: 768 },
      { value: '768x1024', label: '768×1024 (高清纵向)', width: 768, height: 1024 }
    ]
  }
}

// 创建单例实例
const aiImageService = new AIImageService()

export default aiImageService
export { AIImageService }
