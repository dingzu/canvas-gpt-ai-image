<template>
  <div class="overlay">
    <div class="ai-dialog" @click.stop>
      <div class="dialog-header">
        <h3>AI 图像生成</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      
      <div class="dialog-content">
        <!-- 图片预览 -->
        <div class="preview-section">
          <div class="preview-header">
            <h4>实际传输内容预览</h4>
            <button @click="downloadCroppedImage" class="download-icon-btn" title="下载截取图片">
              📥
            </button>
          </div>
          <div class="preview-container">
            <canvas 
              ref="previewCanvas"
              class="preview-canvas"
              :width="previewWidth"
              :height="previewHeight"
            ></canvas>
          </div>
          <div class="preview-info">
            <p class="preview-mode">
              {{ currentSelectionMode }}
            </p>
            <p class="preview-tip">绿色边框表示实际发送给AI的图像范围</p>
            <p v-if="debugInfo" class="debug-info">
              截取区域: {{ debugInfo.left }},{{ debugInfo.top }} {{ debugInfo.width }}×{{ debugInfo.height }}
            </p>
          </div>
        </div>

        <!-- 描述词设置 -->
        <div class="prompt-section">
          <h4>自定义描述词</h4>
          <textarea 
            v-model="customPrompt"
            class="prompt-textarea"
            rows="3"
            placeholder="请输入自定义描述词..."
          ></textarea>
        </div>

        <!-- API密钥设置 -->
        <div class="api-key-section" v-if="!hasApiKey">
          <h4>API密钥</h4>
          <div class="api-key-input-group">
            <input 
              v-model="tempApiKey"
              type="password" 
              placeholder="请输入API密钥..."
              class="api-key-input"
            >
            <button @click="saveApiKey" class="set-key-btn" :disabled="!tempApiKey.trim()">
              设置
            </button>
          </div>
          <p class="api-key-tip">请先设置API密钥才能生成图像</p>
        </div>

        <!-- 生成参数 -->
        <div class="params-section">
          <div class="param-row">
            <div class="param-group">
              <h4>图像质量</h4>
              <select v-model="quality" class="param-select">
                <option value="auto">自动</option>
                <option value="high">高质量</option>
                <option value="medium">中等质量</option>
                <option value="low">低质量</option>
              </select>
            </div>

            <div class="param-group">
              <h4>输出尺寸</h4>
              <select v-model="selectedSize" class="param-select">
                <option value="auto">自动 (根据内容自适应)</option>
                <option value="512x512">512×512 (正方形)</option>
                <option value="768x512">768×512 (横向)</option>
                <option value="512x768">512×768 (纵向)</option>
                <option value="1024x1024">1024×1024 (高清正方形)</option>
                <option value="1024x768">1024×768 (高清横向)</option>
                <option value="768x1024">768×1024 (高清纵向)</option>
              </select>
            </div>
          </div>
          

        </div>

        <!-- 操作按钮 -->
        <div class="actions">
          <button class="cancel-btn" @click="$emit('close')">取消</button>
          <button 
            class="generate-btn" 
            @click="handleGenerate"
            :disabled="!customPrompt.trim() || isGenerating || !hasApiKey"
          >
            {{ isGenerating ? '生成中...' : '开始生成' }}
          </button>
        </div>
      </div>
    </div>


  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import aiImageService from '../services/aiImageService.js'

export default {
  name: 'AIGenerateDialog',
  props: {
    canvas: {
      type: Object,
      required: true
    }
  },
  emits: ['close', 'generate'],
  setup(props, { emit }) {
    const previewCanvas = ref(null)
    const customPrompt = ref('生成一张图片')
    const quality = ref('auto')
    const selectedSize = ref('auto')
    // 固定为仅选中对象模式
    const captureMode = 'selected'
    const isGenerating = ref(false)
    const tempApiKey = ref('')
    const hasApiKey = ref(false)
    const debugInfo = ref(null)
    
    const previewWidth = 200
    const previewHeight = 150
    
    // 保存事件监听器引用用于清理
    let canvasEventListeners = null
    let updateTimer = null

    // 获取截取区域 (提前定义，供computed使用)
    const getCaptureArea = () => {
      if (!props.canvas) return { left: 0, top: 0, width: 800, height: 600 }
      
      const canvasElement = props.canvas.getElement()
      
      if (captureMode === 'selected') {
        // 获取当前选中的对象或选择组
        const activeObject = props.canvas.getActiveObject()
        
        if (!activeObject) {
          // 没有选中对象，自动计算所有可见对象的包围盒
          console.log('=== 没有选中对象，自动计算所有可见元素 ===')
          
          const allObjects = props.canvas.getObjects().filter(obj => 
            obj.visible !== false && 
            obj.customType !== 'ai-details-button' &&
            obj.customType !== 'ai-loading'
          )
          
          console.log('Found', allObjects.length, 'visible objects')
          
          if (allObjects.length === 0) {
            // 没有任何对象，返回画布中心的默认区域，而不是整个画布
            console.log('No objects found, using center default area instead of full canvas')
            const canvasWidth = props.canvas.getWidth()
            const canvasHeight = props.canvas.getHeight()
            
            // 使用画布中心的合理大小区域（比如画布的1/4大小，最小400x300）
            const defaultWidth = Math.min(400, canvasWidth * 0.5)
            const defaultHeight = Math.min(300, canvasHeight * 0.5)
            
            const result = {
              left: Math.floor((canvasWidth - defaultWidth) / 2),
              top: Math.floor((canvasHeight - defaultHeight) / 2),
              width: defaultWidth,
              height: defaultHeight
            }
            
            console.log('Default area for empty canvas:', result)
            return result
          }
          
          // 计算所有对象的紧凑包围盒（忽略空白区域）
          let minX = Number.MAX_SAFE_INTEGER
          let minY = Number.MAX_SAFE_INTEGER
          let maxX = Number.MIN_SAFE_INTEGER
          let maxY = Number.MIN_SAFE_INTEGER
          
          allObjects.forEach((obj, index) => {
            const bounds = obj.getBoundingRect()
            console.log(`Object ${index} (${obj.type}):`, bounds)
            
            minX = Math.min(minX, bounds.left)
            minY = Math.min(minY, bounds.top)
            maxX = Math.max(maxX, bounds.left + bounds.width)
            maxY = Math.max(maxY, bounds.top + bounds.height)
          })
          
          // 添加小量边距以确保内容不会被裁剪到边缘，但保持紧凑
          const padding = 10  // 10像素的小边距
          
          // 确保边界不超出画布，并保持紧凑
          const left = Math.max(0, Math.floor(minX - padding))
          const top = Math.max(0, Math.floor(minY - padding))
          const right = Math.min(props.canvas.getWidth(), Math.ceil(maxX + padding))
          const bottom = Math.min(props.canvas.getHeight(), Math.ceil(maxY + padding))
          
          const result = {
            left,
            top,
            width: right - left,
            height: bottom - top
          }
          
          console.log('Compact bounds for all objects (with minimal padding):', result)
          console.log('Saved space compared to full canvas:', {
            horizontalSaving: `${Math.round((1 - result.width / props.canvas.getWidth()) * 100)}%`,
            verticalSaving: `${Math.round((1 - result.height / props.canvas.getHeight()) * 100)}%`
          })
          return result
        }
        
        // 获取选中对象（单个或组合）的包围盒
        // 这里直接使用 activeObject.getBoundingRect() 
        // 无论是单选还是多选（ActiveSelection），都能正确计算边界
        const bounds = activeObject.getBoundingRect()
        
        console.log('=== 选中对象边界信息 ===')
        console.log('Active object type:', activeObject.type)
        console.log('Is ActiveSelection:', activeObject.type === 'activeSelection')
        console.log('Bounding rect:', bounds)
        
        // 如果是 ActiveSelection，也记录一下子对象的边界作为对比
        if (activeObject.type === 'activeSelection') {
          const objects = activeObject.getObjects()
          console.log('ActiveSelection contains', objects.length, 'objects')
          
          // 手动计算一下子对象的总边界作为验证
          let manualMinX = Number.MAX_SAFE_INTEGER
          let manualMinY = Number.MAX_SAFE_INTEGER  
          let manualMaxX = Number.MIN_SAFE_INTEGER
          let manualMaxY = Number.MIN_SAFE_INTEGER
          
          objects.forEach((obj, index) => {
            const objBounds = obj.getBoundingRect()
            console.log(`Object ${index} (${obj.type}):`, objBounds)
            
            manualMinX = Math.min(manualMinX, objBounds.left)
            manualMinY = Math.min(manualMinY, objBounds.top)
            manualMaxX = Math.max(manualMaxX, objBounds.left + objBounds.width)
            manualMaxY = Math.max(manualMaxY, objBounds.top + objBounds.height)
          })
          
          const manualBounds = {
            left: manualMinX,
            top: manualMinY,
            width: manualMaxX - manualMinX,
            height: manualMaxY - manualMinY
          }
          
          console.log('Manual calculation bounds:', manualBounds)
          console.log('Bounds comparison:', {
            'getBoundingRect()': bounds,
            'manual calculation': manualBounds,
            'difference': {
              left: Math.abs(bounds.left - manualBounds.left),
              top: Math.abs(bounds.top - manualBounds.top),
              width: Math.abs(bounds.width - manualBounds.width),
              height: Math.abs(bounds.height - manualBounds.height)
            }
          })
        }
        
        // 确保边界不超出画布
        const left = Math.max(0, Math.floor(bounds.left))
        const top = Math.max(0, Math.floor(bounds.top))
        const right = Math.min(props.canvas.getWidth(), Math.ceil(bounds.left + bounds.width))
        const bottom = Math.min(props.canvas.getHeight(), Math.ceil(bounds.top + bounds.height))
        
        const result = {
          left,
          top,
          width: right - left,
          height: bottom - top
        }
        
        console.log('Calculated capture area:', result)
        return result
      } else {
        // 所有内容模式：获取画布上所有对象的包围盒
        const allObjects = props.canvas.getObjects().filter(obj => 
          obj.visible !== false && obj.customType !== 'ai-details-button'
        )
        
        if (allObjects.length === 0) {
          return {
            left: 0,
            top: 0,
            width: props.canvas.getWidth(),
            height: props.canvas.getHeight()
          }
        }
        
        let minX = Number.MAX_SAFE_INTEGER
        let minY = Number.MAX_SAFE_INTEGER
        let maxX = Number.MIN_SAFE_INTEGER
        let maxY = Number.MIN_SAFE_INTEGER
        
        allObjects.forEach(obj => {
          const bounds = obj.getBoundingRect()
          minX = Math.min(minX, bounds.left)
          minY = Math.min(minY, bounds.top)
          maxX = Math.max(maxX, bounds.left + bounds.width)
          maxY = Math.max(maxY, bounds.top + bounds.height)
        })
        
        // 确保边界不超出画布
        const left = Math.max(0, Math.floor(minX))
        const top = Math.max(0, Math.floor(minY))
        const right = Math.min(props.canvas.getWidth(), Math.ceil(maxX))
        const bottom = Math.min(props.canvas.getHeight(), Math.ceil(maxY))
        
        return {
          left,
          top,
          width: right - left,
          height: bottom - top
        }
      }
    }

    // 计算选中的尺寸
    const outputSize = computed(() => {
      if (selectedSize.value === 'auto') {
        // auto模式：根据截取内容自动决定尺寸
        const captureArea = getCaptureArea()
        if (captureArea.width > 0 && captureArea.height > 0) {
          // 根据截取内容的宽高比选择合适的标准尺寸
          const aspectRatio = captureArea.width / captureArea.height
          
          if (Math.abs(aspectRatio - 1) < 0.1) {
            // 接近正方形 (0.9 ~ 1.1)
            return captureArea.width * captureArea.height > 400000 ? 
              { width: 1024, height: 1024 } : { width: 512, height: 512 }
          } else if (aspectRatio > 1.2) {
            // 横向图片
            return captureArea.width * captureArea.height > 300000 ? 
              { width: 1024, height: 768 } : { width: 768, height: 512 }
          } else {
            // 纵向图片
            return captureArea.width * captureArea.height > 300000 ? 
              { width: 768, height: 1024 } : { width: 512, height: 768 }
          }
        }
        // 默认fallback
        return { width: 512, height: 512 }
      } else {
        // 手动选择的尺寸
        const [width, height] = selectedSize.value.split('x').map(Number)
        return { width, height }
      }
    })

    // 最终发送的prompt，拼接默认描述词和自定义描述词
    const finalPrompt = computed(() => {
      return `根据图片上的标注生成，${customPrompt.value}`
    })

    // 当前选择模式的显示文字
    const currentSelectionMode = computed(() => {
      if (!props.canvas) return '📌 准备中...'
      
      const activeObject = props.canvas.getActiveObject()
      if (!activeObject) {
        // 没有选中对象，检查是否有可见对象
        const allObjects = props.canvas.getObjects().filter(obj => 
          obj.visible !== false && 
          obj.customType !== 'ai-details-button' &&
          obj.customType !== 'ai-loading'
        )
        
        if (allObjects.length === 0) {
          return '📐 画布中心区域（无内容对象）'
        } else {
          return `🔄 自动包含所有对象（${allObjects.length}个）`
        }
      } else if (activeObject.type === 'activeSelection') {
        const count = activeObject.size()
        return `📌 已选中${count}个对象`
      } else {
        return '📌 已选中1个对象'
      }
    })



    // 生成预览图
    const generatePreview = async () => {
      if (!props.canvas || !previewCanvas.value) return

      try {
        const ctx = previewCanvas.value.getContext('2d')
        
        // 清空预览画布
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, previewWidth, previewHeight)
        
        // 获取截取区域
        const contentBounds = getCaptureArea()
        
        console.log('=== 预览绘制时的调试信息 ===')
        console.log('Preview canvas size:', previewWidth, 'x', previewHeight)
        console.log('Content bounds:', contentBounds)
        
        // 检查当前选中状态
        const activeObject = props.canvas.getActiveObject()
        if (activeObject) {
          console.log('Active object info:', {
            type: activeObject.type,
            isActiveSelection: activeObject.type === 'activeSelection',
            objectCount: activeObject.type === 'activeSelection' ? activeObject.size() : 1
          })
          
          if (activeObject.type === 'activeSelection') {
            console.log('ActiveSelection objects:', activeObject.getObjects().map(obj => ({
              type: obj.type,
              left: obj.left,
              top: obj.top,
              width: obj.width,
              height: obj.height
            })))
          }
        }
        
        // 更新调试信息
        debugInfo.value = {
          left: contentBounds.left,
          top: contentBounds.top,
          width: contentBounds.width,
          height: contentBounds.height
        }
        
        // 使用Fabric.js的toDataURL方法获取正确的截取内容
        const toDataURLOptions = {
          format: 'png',
          quality: 1,
          left: contentBounds.left,
          top: contentBounds.top,
          width: contentBounds.width,
          height: contentBounds.height,
          multiplier: 1
        }
        
        console.log('toDataURL options:', toDataURLOptions)
        const dataURL = props.canvas.toDataURL(toDataURLOptions)
        
        // 创建图像对象
        const img = new Image()
        img.onload = () => {
          // 计算缩放比例，保持宽高比
          const imageAspectRatio = img.width / img.height
          const previewAspectRatio = previewWidth / previewHeight
          
          let scaledWidth, scaledHeight
          
          if (imageAspectRatio > previewAspectRatio) {
            // 图片更宽，以宽度为准
            scaledWidth = previewWidth
            scaledHeight = previewWidth / imageAspectRatio
          } else {
            // 图片更高，以高度为准
            scaledHeight = previewHeight
            scaledWidth = previewHeight * imageAspectRatio
          }
          
          // 计算居中位置
          const offsetX = (previewWidth - scaledWidth) / 2
          const offsetY = (previewHeight - scaledHeight) / 2
          
          console.log('Preview drawing params (Fixed aspect ratio):', {
            imageSize: { width: img.width, height: img.height },
            imageAspectRatio,
            previewAspectRatio,
            scaledWidth,
            scaledHeight,
            offsetX,
            offsetY,
            drawRegion: `x:${offsetX}, y:${offsetY}, w:${scaledWidth}, h:${scaledHeight}`
          })
          
          // 绘制从Fabric.js获取的正确图像，保持宽高比
          ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight)
          
          // 添加边框提示这是实际传输的内容
          ctx.strokeStyle = '#4ECDC4'
          ctx.lineWidth = 2
          ctx.strokeRect(offsetX - 1, offsetY - 1, scaledWidth + 2, scaledHeight + 2)
        }
        
        img.src = dataURL
        
      } catch (error) {
        console.error('生成预览失败:', error)
      }
    }



    // 检查API密钥状态
    const checkApiKeyStatus = () => {
      const savedKey = localStorage.getItem('ai_api_key') || aiImageService.apiKey
      hasApiKey.value = Boolean(savedKey)
      if (savedKey) {
        aiImageService.setApiKey(savedKey)
      }
    }

    // 保存API密钥
    const saveApiKey = () => {
      if (tempApiKey.value.trim()) {
        localStorage.setItem('ai_api_key', tempApiKey.value.trim())
        aiImageService.setApiKey(tempApiKey.value.trim())
        hasApiKey.value = true
        tempApiKey.value = ''
      }
    }



    // 下载截取的图片
    const downloadCroppedImage = async () => {
      try {
        if (!props.canvas) return

        // 获取截取区域
        const contentBounds = getCaptureArea()
        
        console.log('=== 使用Fabric.js直接截取 ===')
        console.log('Content bounds:', contentBounds)

        // 使用Fabric.js的toDataURL方法直接截取指定区域
        const dataURL = props.canvas.toDataURL({
          format: 'png',
          quality: 1,
          left: contentBounds.left,
          top: contentBounds.top,
          width: contentBounds.width,
          height: contentBounds.height,
          multiplier: 1
        })

        // 转换为blob并下载
        fetch(dataURL)
          .then(res => res.blob())
          .then(blob => {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            
            // 生成文件名
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')
            a.download = `canvas-crop-selected-${timestamp}.png`
            
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            
            console.log('已下载截取图片 (Fabric.js方法):', a.download)
          })

      } catch (error) {
        console.error('下载截取图片失败:', error)
        alert('下载失败: ' + error.message)
      }
    }



    // 处理生成
    const handleGenerate = async () => {
      if (isGenerating.value || !customPrompt.value.trim() || !hasApiKey.value) return
      
      isGenerating.value = true
      
      try {
        // 获取截取区域
        const contentBounds = getCaptureArea()
        
        console.log('=== 实际生成时的调试信息 (Fabric.js方法) ===')
        console.log('Content bounds:', contentBounds)
        console.log('Canvas zoom:', props.canvas.getZoom())
        console.log('Viewport transform:', props.canvas.viewportTransform)

        // 使用Fabric.js的toDataURL方法直接获取正确的截取内容
        const dataURL = props.canvas.toDataURL({
          format: 'png',
          quality: 1,
          left: contentBounds.left,
          top: contentBounds.top,
          width: contentBounds.width,
          height: contentBounds.height,
          multiplier: 1
        })

        // 转换DataURL为Blob
        const imageBlob = await fetch(dataURL).then(res => res.blob())

        const generateParams = {
          image: imageBlob,
          prompt: finalPrompt.value,
          quality: quality.value,
          outputSize: outputSize.value,
          captureMode: captureMode
        }

        // 触发生成事件
        emit('generate', generateParams)
        
      } catch (error) {
        console.error('准备生成参数失败:', error)
        alert('准备失败，请重试: ' + error.message)
      } finally {
        isGenerating.value = false
      }
    }



    onMounted(() => {
      nextTick(() => {
        generatePreview()
        checkApiKeyStatus()
        
        // 监听画布选择变化和对象移动，实时更新预览
        if (props.canvas) {
          // 防抖更新函数
          const debouncedUpdate = () => {
            if (updateTimer) {
              clearTimeout(updateTimer)
            }
            updateTimer = setTimeout(() => {
              nextTick(() => {
                generatePreview()
              })
            }, 100) // 100ms 防抖
          }
          
          // 立即更新函数（用于选择事件）
          const immediateUpdate = () => {
            if (updateTimer) {
              clearTimeout(updateTimer)
            }
            nextTick(() => {
              generatePreview()
            })
          }
          
          // 保存监听器引用用于清理
          canvasEventListeners = {
            'selection:created': immediateUpdate,
            'selection:updated': immediateUpdate,
            'selection:cleared': immediateUpdate,
            'object:moving': debouncedUpdate,
            'object:moved': immediateUpdate,
            'object:scaling': debouncedUpdate,
            'object:scaled': immediateUpdate,
            'object:rotating': debouncedUpdate,
            'object:rotated': immediateUpdate,
            'object:modified': immediateUpdate,
            'object:added': immediateUpdate,      // 对象添加时更新
            'object:removed': immediateUpdate     // 对象删除时更新
          }
          
          // 注册事件监听器
          Object.keys(canvasEventListeners).forEach(event => {
            props.canvas.on(event, canvasEventListeners[event])
          })
        }
      })
    })

    onUnmounted(() => {
      // 清理定时器
      if (updateTimer) {
        clearTimeout(updateTimer)
        updateTimer = null
      }
      
      // 清理事件监听器
      if (props.canvas && canvasEventListeners) {
        Object.keys(canvasEventListeners).forEach(event => {
          props.canvas.off(event, canvasEventListeners[event])
        })
        canvasEventListeners = null
      }
    })

    return {
      previewCanvas,
      customPrompt,
      finalPrompt,
      quality,
      selectedSize,
      isGenerating,
      tempApiKey,
      hasApiKey,
      debugInfo,
      previewWidth,
      previewHeight,
      outputSize,
      currentSelectionMode,
      handleGenerate,
      saveApiKey,
      downloadCroppedImage
    }
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.ai-dialog {
  background: white;
  border-radius: 12px;
  width: 500px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
  background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
  color: white;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
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

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.dialog-content {
  padding: 24px;
  max-height: calc(90vh - 80px);
  overflow-y: auto;
}

.preview-section,
.prompt-section,
.params-section {
  margin-bottom: 24px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.preview-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.download-icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: #FF6B6B;
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(255, 107, 107, 0.3);
}

.download-icon-btn:hover {
  background: #e55a5a;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(255, 107, 107, 0.4);
}

.download-icon-btn:active {
  transform: translateY(0);
}

.prompt-section h4,
.params-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.preview-container {
  border: 2px solid #eee;
  border-radius: 8px;
  padding: 12px;
  background: #f9f9f9;
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.preview-canvas {
  border-radius: 4px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-mode {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: #333;
}

.preview-tip {
  margin: 0;
  font-size: 11px;
  color: #666;
  line-height: 1.3;
}

.debug-info {
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 10px;
  color: #888;
  background: rgba(78, 205, 196, 0.1);
  padding: 2px 4px;
  border-radius: 3px;
  align-self: flex-start;
}

.prompt-textarea {
  width: 100%;
  border: 2px solid #eee;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  transition: border-color 0.2s;
}

.prompt-textarea:focus {
  outline: none;
  border-color: #4ECDC4;
}

.api-key-section {
  margin-bottom: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.api-key-section h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}

.api-key-input-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.api-key-input {
  flex: 1;
  border: 2px solid #eee;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.api-key-input:focus {
  outline: none;
  border-color: #4ECDC4;
}

.set-key-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #4ECDC4;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.set-key-btn:hover:not(:disabled) {
  background: #45b7aa;
}

.set-key-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.api-key-tip {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #666;
}

.params-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.param-group h4 {
  margin-bottom: 8px;
}

.param-select {
  width: 100%;
  border: 2px solid #eee;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;
}

.param-select:focus {
  outline: none;
  border-color: #4ECDC4;
}

.preview-btn {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid #4ECDC4;
  border-radius: 8px;
  background: white;
  color: #4ECDC4;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.preview-btn:hover {
  background: #4ECDC4;
  color: white;
}

/* Curl预览弹窗样式 */
.curl-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.curl-preview-dialog {
  background: white;
  border-radius: 12px;
  width: 90vw;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.curl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
  background: #f8f9fa;
}

.curl-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.curl-content {
  padding: 24px;
  max-height: calc(90vh - 80px);
  overflow-y: auto;
}

.curl-section {
  margin-bottom: 24px;
  position: relative;
}

.curl-section:last-child {
  margin-bottom: 0;
}

.curl-section h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.curl-code,
.curl-params {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: #333;
  margin: 0;
}

.copy-btn {
  position: absolute;
  top: 40px;
  right: 12px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: #4ECDC4;
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: #45b7aa;
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 20px;
  border-top: 1px solid #eee;
}

.cancel-btn,
.generate-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
}

.cancel-btn:hover {
  background: #e5e5e5;
}

.generate-btn {
  background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
  color: white;
  min-width: 100px;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
}

.generate-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

@media (max-width: 600px) {
  .ai-dialog {
    width: 95vw;
    margin: 20px;
  }
  
  .preview-header h4 {
    font-size: 13px;
  }
  
  .download-icon-btn {
    width: 24px;
    height: 24px;
    font-size: 10px;
  }
  
  .preview-info {
    gap: 2px;
  }
  
  .preview-mode {
    font-size: 11px;
  }
  
  .preview-tip {
    font-size: 10px;
  }
  
  .debug-info {
    font-size: 9px;
  }
  
  .params-section {
    grid-template-columns: 1fr;
  }
  
  .actions {
    flex-direction: column;
  }
  
  .cancel-btn,
  .generate-btn {
    width: 100%;
  }
}
</style>
