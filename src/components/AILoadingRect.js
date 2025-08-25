import { fabric } from 'fabric'

/**
 * AI加载矩形组件
 * 在画布上创建一个显示加载状态的矩形，加载完成后替换为生成的图片
 */
export class AILoadingRect {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.options = {
      width: 300,
      height: 200,
      left: 100,
      top: 100,
      ...options
    }
    
    this.loadingGroup = null
    this.animationFrame = null
    this.isDestroyed = false
    this.statusTimeout = null
    this.currentPhase = 'uploading' // uploading, generating
    
    this.createLoadingRect()
  }

  // 创建加载矩形
  createLoadingRect() {
    // 创建背景矩形
    const background = new fabric.Rect({
      width: this.options.width,
      height: this.options.height,
      fill: '#f8f9fa',
      stroke: '#e9ecef',
      strokeWidth: 2,
      rx: 8,
      ry: 8,
      originX: 'center',
      originY: 'center'
    })

    // 创建AI图标背景
    const iconBg = new fabric.Circle({
      radius: 25,
      fill: '#007AFF',
      originX: 'center',
      originY: 'center',
      top: -30
    })

    // 创建AI图标文字
    const aiIcon = new fabric.Text('AI', {
      fontSize: 16,
      fill: 'white',
      fontWeight: 'bold',
      fontFamily: 'Arial, sans-serif',
      originX: 'center',
      originY: 'center',
      top: -30
    })

    // 创建加载文字
    const loadingText = new fabric.Text('上传图片中...', {
      fontSize: 16,
      fill: '#333',
      fontFamily: 'Arial, sans-serif',
      originX: 'center',
      originY: 'center',
      top: 10
    })

    // 创建进度条背景
    const progressBg = new fabric.Rect({
      width: this.options.width - 60,
      height: 4,
      fill: '#e9ecef',
      rx: 2,
      ry: 2,
      originX: 'center',
      originY: 'center',
      top: 35
    })

    // 创建进度条
    const progressBar = new fabric.Rect({
      width: 0,
      height: 4,
      fill: '#007AFF',
      rx: 2,
      ry: 2,
      originX: 'left',
      originY: 'center',
      left: -(this.options.width - 60) / 2,
      top: 35
    })

    // 创建加载点动画
    const dots = []
    for (let i = 0; i < 3; i++) {
      const dot = new fabric.Circle({
        radius: 3,
        fill: '#007AFF',
        left: -15 + i * 10,
        top: 50,
        originX: 'center',
        originY: 'center'
      })
      dots.push(dot)
    }

    // 组合所有元素
    const elements = [background, iconBg, aiIcon, loadingText, progressBg, progressBar, ...dots]
    
    this.loadingGroup = new fabric.Group(elements, {
      left: this.options.left,
      top: this.options.top,
      selectable: true,
      evented: true,
      hasControls: false,  // 禁用尺寸调整控制
      hasBorders: true,
      hasRotatingPoint: false,  // 禁用旋转控制
      lockScalingX: true,  // 锁定水平缩放
      lockScalingY: true,  // 锁定垂直缩放
      lockRotation: true,  // 锁定旋转
      transparentCorners: false,
      cornerColor: '#007AFF',
      borderColor: '#007AFF',
      borderScaleFactor: 2,
      customType: 'ai-loading'
    })

    // 存储引用方便访问
    this.progressBar = progressBar
    this.dots = dots
    this.loadingText = loadingText
    this.iconBg = iconBg

    // 添加到画布
    this.canvas.add(this.loadingGroup)
    this.canvas.renderAll()

    // 开始动画
    this.startAnimation()
    
    // 设置状态转换定时器（3秒后切换状态）
    this.statusTimeout = setTimeout(() => {
      this.switchToGeneratingPhase()
    }, 3000)
  }

  // 开始动画
  startAnimation() {
    let progress = 0
    let dotIndex = 0
    let lastTime = Date.now()

    const animate = () => {
      if (this.isDestroyed) return

      const now = Date.now()
      const deltaTime = now - lastTime
      lastTime = now

      // 进度条动画（伪进度）
      progress += deltaTime * 0.0002 // 调整速度
      if (progress > 1) progress = 0.2 // 不要让进度条跑满

      const maxWidth = this.options.width - 60
      this.progressBar.set('width', maxWidth * progress)

      // 点点动画
      if (Math.floor(now / 500) % 3 !== dotIndex % 3) {
        dotIndex = Math.floor(now / 500)
        this.dots.forEach((dot, index) => {
          dot.set('opacity', index === (dotIndex % 3) ? 1 : 0.3)
        })
      }

      // 图标脉冲动画
      const pulse = Math.sin(now * 0.003) * 0.1 + 1
      this.iconBg.set('scaleX', pulse)
      this.iconBg.set('scaleY', pulse)

      this.canvas.renderAll()
      this.animationFrame = requestAnimationFrame(animate)
    }

    this.animationFrame = requestAnimationFrame(animate)
  }

  // 切换到生成阶段
  switchToGeneratingPhase() {
    if (this.isDestroyed || !this.loadingText) return
    
    this.currentPhase = 'generating'
    this.loadingText.set('text', '正在生成中请稍后...')
    this.canvas.renderAll()
  }

  // 更新加载状态文字
  updateStatus(status) {
    if (this.isDestroyed || !this.loadingText) return
    
    // 如果外部传入了状态，直接使用（覆盖内部状态）
    this.loadingText.set('text', status)
    this.canvas.renderAll()
  }

  // 显示错误状态
  showError(message = '生成失败') {
    if (this.isDestroyed) return

    // 停止动画
    this.stopAnimation()

    // 更新样式为错误状态
    const background = this.loadingGroup.getObjects()[0]
    background.set({
      fill: '#ffe6e6',
      stroke: '#ffb3b3'
    })

    this.iconBg.set('fill', '#ff4757')
    this.loadingText.set({
      text: message,
      fill: '#ff4757'
    })

    // 隐藏进度条和点点
    this.progressBar.set('opacity', 0)
    this.dots.forEach(dot => dot.set('opacity', 0))

    this.canvas.renderAll()
  }

  // 加载成功，替换为生成的图片
  async replaceWithImage(imageUrl, apiResponse = null) {
    if (this.isDestroyed) return

    try {
      // 停止动画
      this.stopAnimation()

      // 加载图片
      const img = await this.loadImage(imageUrl)
      
      // 计算适合的尺寸
      const maxWidth = this.options.width
      const maxHeight = this.options.height
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height)
      
      // 创建Fabric图片对象
      const fabricImg = new fabric.Image(img, {
        left: this.loadingGroup.left,
        top: this.loadingGroup.top,
        scaleX: scale,
        scaleY: scale,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        hasRotatingPoint: true,
        transparentCorners: false,
        cornerColor: '#007AFF',
        cornerStyle: 'circle',
        cornerSize: 12,
        borderColor: '#007AFF',
        borderScaleFactor: 2,
        customType: 'ai-generated-image',
        originX: 'center',
        originY: 'center'
      })

      // 保存API响应数据到图片对象
      if (apiResponse) {
        fabricImg.set('aiApiResponse', JSON.stringify(apiResponse))
        fabricImg.set('aiGeneratedAt', new Date().toISOString())
      }

      // 移除加载矩形
      this.canvas.remove(this.loadingGroup)
      
      // 添加生成的图片
      this.canvas.add(fabricImg)
      
      // 创建详情按钮
      this.createDetailsButton(fabricImg)
      
      this.canvas.setActiveObject(fabricImg)
      this.canvas.renderAll()

      // 标记为已销毁
      this.isDestroyed = true

      return fabricImg

    } catch (error) {
      console.error('替换图片失败:', error)
      this.showError('图片加载失败')
      throw error
    }
  }

  // 创建详情按钮
  createDetailsButton(fabricImg) {
    // 创建详情按钮
    const detailsBtn = new fabric.Circle({
      radius: 12,
      fill: '#007AFF',
      left: fabricImg.left + (fabricImg.getScaledWidth() / 2) - 12,
      top: fabricImg.top - (fabricImg.getScaledHeight() / 2) - 12,
      selectable: false,
      evented: true,
      hasControls: false,
      hasBorders: false,
      customType: 'ai-details-btn',
      originX: 'center',
      originY: 'center'
    })

    // 添加图标文字
    const detailsIcon = new fabric.Text('i', {
      fontSize: 12,
      fill: 'white',
      fontWeight: 'bold',
      fontFamily: 'Arial, sans-serif',
      left: fabricImg.left + (fabricImg.getScaledWidth() / 2) - 12,
      top: fabricImg.top - (fabricImg.getScaledHeight() / 2) - 12,
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      customType: 'ai-details-icon',
      originX: 'center',
      originY: 'center'
    })

    // 创建按钮组
    const buttonGroup = new fabric.Group([detailsBtn, detailsIcon], {
      left: fabricImg.left + (fabricImg.getScaledWidth() / 2) - 12,
      top: fabricImg.top - (fabricImg.getScaledHeight() / 2) - 12,
      selectable: false,
      evented: true,
      hasControls: false,
      hasBorders: false,
      customType: 'ai-details-button',
      originX: 'center',
      originY: 'center',
      hoverCursor: 'pointer'
    })

    // 关联到主图片
    buttonGroup.set('linkedImage', fabricImg)
    fabricImg.set('detailsButton', buttonGroup)

    // 添加点击事件
    buttonGroup.on('mousedown', (e) => {
      e.e.stopPropagation()
      this.showApiDetails(fabricImg)
    })

    // 添加到画布
    this.canvas.add(buttonGroup)

    // 当主图片移动时，同步移动按钮
    fabricImg.on('moving', () => {
      this.updateButtonPosition(fabricImg, buttonGroup)
    })

    fabricImg.on('scaling', () => {
      this.updateButtonPosition(fabricImg, buttonGroup)
    })

    fabricImg.on('rotating', () => {
      this.updateButtonPosition(fabricImg, buttonGroup)
    })

    // 当主图片被选中时显示按钮，取消选中时隐藏
    this.canvas.on('selection:created', (e) => {
      if (e.selected && e.selected.includes(fabricImg)) {
        buttonGroup.set('visible', true)
        this.canvas.renderAll()
      }
    })

    this.canvas.on('selection:updated', (e) => {
      if (e.selected && e.selected.includes(fabricImg)) {
        buttonGroup.set('visible', true)
      } else {
        buttonGroup.set('visible', false)
      }
      this.canvas.renderAll()
    })

    this.canvas.on('selection:cleared', () => {
      buttonGroup.set('visible', false)
      this.canvas.renderAll()
    })

    // 初始隐藏按钮
    buttonGroup.set('visible', false)
  }

  // 更新按钮位置
  updateButtonPosition(fabricImg, buttonGroup) {
    const imgBounds = fabricImg.getBoundingRect()
    buttonGroup.set({
      left: imgBounds.left + imgBounds.width - 12,
      top: imgBounds.top - 12
    })
    this.canvas.renderAll()
  }

  // 显示API详情
  showApiDetails(fabricImg) {
    const apiResponse = fabricImg.get('aiApiResponse')
    const generatedAt = fabricImg.get('aiGeneratedAt')
    
    if (!apiResponse) {
      alert('没有找到API响应数据')
      return
    }

    try {
      const responseData = JSON.parse(apiResponse)
      
      // 创建详情弹窗
      const detailsModal = document.createElement('div')
      detailsModal.className = 'ai-details-modal'
      detailsModal.innerHTML = `
        <div class="ai-details-overlay">
          <div class="ai-details-dialog">
            <div class="ai-details-header">
              <h3>AI生成详情</h3>
              <button class="ai-details-close">×</button>
            </div>
            <div class="ai-details-content">
              <div class="ai-details-info">
                <p><strong>生成时间:</strong> ${new Date(generatedAt).toLocaleString()}</p>
                <p><strong>模型:</strong> ${responseData.model || 'gpt-image-1'}</p>
                ${responseData.usage ? `
                  <p><strong>Token使用:</strong></p>
                  <ul>
                    <li>输入Token: ${responseData.usage.input_tokens || 0}</li>
                    <li>输出Token: ${responseData.usage.output_tokens || 0}</li>
                    <li>总Token: ${responseData.usage.total_tokens || 0}</li>
                  </ul>
                ` : ''}
              </div>
              <div class="ai-details-json">
                <h4>完整API响应:</h4>
                <pre class="ai-json-content">${JSON.stringify(responseData, null, 2)}</pre>
              </div>
              <div class="ai-details-actions">
                <button class="ai-copy-json-btn">复制JSON</button>
                <button class="ai-download-json-btn">下载JSON</button>
              </div>
            </div>
          </div>
        </div>
      `

      // 添加样式
      if (!document.querySelector('#ai-details-styles')) {
        const styles = document.createElement('style')
        styles.id = 'ai-details-styles'
        styles.textContent = `
          .ai-details-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10000;
          }
          .ai-details-overlay {
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .ai-details-dialog {
            background: white;
            border-radius: 12px;
            width: 90vw;
            max-width: 800px;
            max-height: 90vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }
          .ai-details-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid #eee;
            background: #f8f9fa;
          }
          .ai-details-header h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
          }
          .ai-details-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.2s;
          }
          .ai-details-close:hover {
            background: rgba(0, 0, 0, 0.1);
          }
          .ai-details-content {
            padding: 24px;
            max-height: calc(90vh - 80px);
            overflow-y: auto;
          }
          .ai-details-info {
            margin-bottom: 24px;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          .ai-details-info p {
            margin: 8px 0;
            font-size: 14px;
          }
          .ai-details-info ul {
            margin: 8px 0 8px 20px;
            font-size: 14px;
          }
          .ai-details-json h4 {
            margin: 0 0 12px 0;
            font-size: 16px;
            font-weight: 600;
            color: #333;
          }
          .ai-json-content {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 16px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            line-height: 1.5;
            overflow: auto;
            max-height: 300px;
            white-space: pre;
            color: #333;
            margin: 0;
          }
          .ai-details-actions {
            display: flex;
            gap: 12px;
            margin-top: 16px;
          }
          .ai-copy-json-btn,
          .ai-download-json-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            background: #007AFF;
            color: white;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .ai-copy-json-btn:hover,
          .ai-download-json-btn:hover {
            background: #0056CC;
          }
        `
        document.head.appendChild(styles)
      }

      // 添加到页面
      document.body.appendChild(detailsModal)

      // 绑定事件
      const closeBtn = detailsModal.querySelector('.ai-details-close')
      const overlay = detailsModal.querySelector('.ai-details-overlay')
      const copyBtn = detailsModal.querySelector('.ai-copy-json-btn')
      const downloadBtn = detailsModal.querySelector('.ai-download-json-btn')

      const closeModal = () => {
        document.body.removeChild(detailsModal)
      }

      closeBtn.onclick = closeModal
      overlay.onclick = (e) => {
        if (e.target === overlay) closeModal()
      }

      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(responseData, null, 2))
          copyBtn.textContent = '已复制!'
          setTimeout(() => {
            copyBtn.textContent = '复制JSON'
          }, 2000)
        } catch (error) {
          console.error('复制失败:', error)
        }
      }

      downloadBtn.onclick = () => {
        const blob = new Blob([JSON.stringify(responseData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ai-response-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

    } catch (error) {
      console.error('解析API响应数据失败:', error)
      alert('API响应数据格式错误')
    }
  }

  // 加载图片的Promise包装器
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = src
    })
  }

  // 停止动画
  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }

  // 销毁组件
  destroy() {
    this.stopAnimation()
    
    // 清理状态定时器
    if (this.statusTimeout) {
      clearTimeout(this.statusTimeout)
      this.statusTimeout = null
    }
    
    if (this.loadingGroup && this.canvas) {
      this.canvas.remove(this.loadingGroup)
      this.canvas.renderAll()
    }
    
    this.isDestroyed = true
    this.loadingGroup = null
    this.progressBar = null
    this.dots = null
    this.loadingText = null
    this.iconBg = null
  }

  // 设置位置
  setPosition(left, top) {
    if (this.isDestroyed || !this.loadingGroup) return
    
    this.loadingGroup.set({ left, top })
    this.canvas.renderAll()
  }

  // 获取位置
  getPosition() {
    if (this.isDestroyed || !this.loadingGroup) return { left: 0, top: 0 }
    
    return {
      left: this.loadingGroup.left,
      top: this.loadingGroup.top
    }
  }
}

export default AILoadingRect
