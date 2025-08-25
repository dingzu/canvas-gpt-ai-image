<template>
  <div id="app">
    <!-- 工具栏 -->
    <div class="toolbar">
      <!-- 选择工具 -->
      <div class="toolbar-group">
        <button 
          class="tool-btn" 
          :class="{ active: currentTool === 'select' }"
          @click="setTool('select')"
          title="选择工具"
        >
          <MousePointer :size="20" />
        </button>
      </div>

      <!-- 添加内容 -->
      <div class="toolbar-group">
        <button 
          class="tool-btn"
          @click="addImage"
          title="添加图片"
        >
          <ImagePlus :size="20" />
        </button>
        <button 
          class="tool-btn"
          @click="addText"
          title="添加文字"
        >
          <Type :size="20" />
        </button>
        <button 
          class="tool-btn" 
          :class="{ active: currentTool === 'bubble' }"
          @click="setTool('bubble')"
          title="添加气泡"
        >
          <MessageCircle :size="20" />
        </button>
      </div>

      <!-- 绘图工具 -->
      <div class="toolbar-group">
        <button 
          class="tool-btn" 
          :class="{ active: currentTool === 'brush' }"
          @click="setTool('brush')"
          title="画笔"
        >
          <Brush :size="20" />
        </button>
        <div v-if="currentTool === 'brush'" class="brush-controls">
          <input 
            type="color" 
            v-model="brushColor" 
            title="画笔颜色"
            style="width: 30px; height: 30px; border: none; border-radius: 6px; cursor: pointer;"
          >
          <input 
            type="range" 
            v-model="brushSize" 
            min="1" 
            max="20" 
            title="画笔大小"
            style="width: 60px;"
          >
        </div>
      </div>

      <!-- 操作工具 -->
      <div class="toolbar-group">
        <button 
          class="tool-btn"
          @click="undo"
          :disabled="!canUndo"
          title="撤销"
        >
          <Undo :size="20" />
        </button>
        <button 
          class="tool-btn"
          @click="redo"
          :disabled="!canRedo"
          title="重做"
        >
          <Redo :size="20" />
        </button>
        <button 
          class="tool-btn"
          @click="deleteSelected"
          title="删除选中"
        >
          <Trash2 :size="20" />
        </button>
        <button 
          class="tool-btn"
          @click="clearCanvas"
          title="清空画布"
        >
          <RotateCcw :size="20" />
        </button>
      </div>

      <!-- AI生成 -->
      <div class="toolbar-group">
        <button 
          class="tool-btn"
          @click="handleAIButtonClick"
          title="AI生成"
          style="background: linear-gradient(45deg, #FF6B6B, #4ECDC4); color: white;"
        >
          <Sparkles :size="20" />
        </button>
      </div>
    </div>

    <!-- 视图控制 -->
    <div class="view-controls">
      <button class="tool-btn" @click="zoomIn" title="放大">
        <ZoomIn :size="20" />
      </button>
      <button class="tool-btn" @click="zoomOut" title="缩小">
        <ZoomOut :size="20" />
      </button>
      <button class="tool-btn" @click="fitToScreen" title="适应屏幕">
        <Maximize :size="20" />
      </button>
      <button class="tool-btn" @click="focusSelected" title="聚焦选中">
        <Focus :size="20" />
      </button>
    </div>

    <!-- 画布容器 -->
    <div 
      ref="canvasContainer" 
      class="canvas-container"
      :class="{ dragging: isDragging }"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @click="handleCanvasClick"
    >
      <canvas ref="fabricCanvas"></canvas>
    </div>

    <!-- AI生成弹窗 -->
    <AIGenerateDialog 
      v-if="showAIPanel" 
      :canvas="canvas"
      @close="showAIPanel = false"
      @generate="handleAIGenerate"
    />

    <!-- API密钥设置弹窗 -->
    <div v-if="showApiKeyDialog" class="overlay" @click="showApiKeyDialog = false">
      <div class="api-key-dialog" @click.stop>
        <h3>设置API密钥</h3>
        <p>请输入您的AI图像生成API密钥</p>
        <input 
          v-model="tempApiKey"
          type="password" 
          placeholder="请输入API密钥..."
          class="api-key-input"
        >
        <div class="api-key-actions">
          <button @click="showApiKeyDialog = false" class="cancel-btn">取消</button>
          <button @click="saveApiKey" class="save-btn">保存</button>
        </div>
      </div>
    </div>

    <!-- 隐藏的文件输入 -->
    <input 
      ref="fileInput" 
      type="file" 
      accept="image/*" 
      multiple 
      style="display: none;" 
      @change="handleFileSelect"
    >
  </div>
</template>

<script>
import { ref, onMounted, nextTick } from 'vue'
import { fabric } from 'fabric'
import html2canvas from 'html2canvas'
import { saveAs } from 'file-saver'
import { 
  MousePointer, 
  ImagePlus, 
  Type, 
  MessageCircle, 
  Brush, 
  Trash2, 
  RotateCcw, 
  Sparkles, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Focus,
  Undo,
  Redo
} from 'lucide-vue-next'
import AIGenerateDialog from './components/AIGenerateDialog.vue'
import { AILoadingRect } from './components/AILoadingRect.js'
import aiImageService from './services/aiImageService.js'

export default {
  name: 'App',
  components: {
    MousePointer,
    ImagePlus,
    Type,
    MessageCircle,
    Brush,
    Trash2,
    RotateCcw,
    Sparkles,
    ZoomIn,
    ZoomOut,
    Maximize,
    Focus,
    Undo,
    Redo,
    AIGenerateDialog
  },
  setup() {
    // 响应式数据
    const canvasContainer = ref(null)
    const fabricCanvas = ref(null)
    const fileInput = ref(null)
    const canvas = ref(null)
    const currentTool = ref('select')
    const isDragging = ref(false)
    const showAIPanel = ref(false)
    const showApiKeyDialog = ref(false)
    const bubbles = ref([])
    const brushColor = ref('#000000')
    const brushSize = ref(3)
    const tempApiKey = ref('')
    const currentAILoader = ref(null)
    
    // 撤销重做相关状态
    const historyStack = ref([])
    const historyIndex = ref(-1)
    const canUndo = ref(false)
    const canRedo = ref(false)
    
    // 画布状态
    const viewState = ref({
      zoom: 1,
      panX: 0,
      panY: 0
    })

    let isDrawing = false
    let drawingPath = null
    let isPanning = false
    let lastPanPoint = { x: 0, y: 0 }
    let isSpacePressed = false

    // 初始化画布
    const initCanvas = () => {
      const container = canvasContainer.value
      if (!container) return

      canvas.value = new fabric.Canvas(fabricCanvas.value, {
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#ffffff',
        selection: true,
        preserveObjectStacking: true,
        isDrawingMode: false
      })

      // 设置画布事件
      setupCanvasEvents()
      
      // 设置全局键盘事件
      setupGlobalKeyEvents()
      
      // 窗口大小改变时调整画布
      window.addEventListener('resize', resizeCanvas)
    }

    // 设置画布事件
    const setupCanvasEvents = () => {
      // 选择事件
      canvas.value.on('selection:created', (e) => {
        console.log('对象被选中:', e.selected)
        document.addEventListener('keydown', handleKeyDown)
      })

      canvas.value.on('selection:updated', (e) => {
        console.log('选择更新:', e.selected)
      })

      canvas.value.on('selection:cleared', () => {
        document.removeEventListener('keydown', handleKeyDown)
      })

      // 双击编辑文字或气泡
      canvas.value.on('mouse:dblclick', (e) => {
        const target = e.target
        if (target) {
          if (target.type === 'i-text' || target.customType === 'text') {
            // IText 对象支持直接编辑
            target.enterEditing()
            target.selectAll()
          } else if (target.customType === 'bubble') {
            editBubble(target)
          }
        }
      })

      // 画笔绘制事件
      canvas.value.on('path:created', (e) => {
        const path = e.path
        path.set({
          stroke: brushColor.value,
          strokeWidth: parseInt(brushSize.value),
          selectable: true,
          evented: true,
          hasControls: true,
          hasBorders: true,
          transparentCorners: false,
          cornerColor: '#007AFF',
          cornerStyle: 'circle',
          cornerSize: 8,
          borderColor: '#007AFF',
          borderScaleFactor: 1.5,
          customType: 'drawing'
        })
        // 绘制完成后保存状态
        setTimeout(() => saveState(), 100)
      })

      // 文字编辑完成事件
      canvas.value.on('text:editing:exited', (e) => {
        // 文字编辑完成后保存状态
        setTimeout(() => saveState(), 100)
      })

      // 对象修改事件（移动、缩放、旋转等）
      canvas.value.on('object:modified', (e) => {
        // 对象修改后保存状态
        setTimeout(() => saveState(), 100)
      })
    }

    // 撤销重做功能
    const saveState = () => {
      if (!canvas.value) return
      
      const state = JSON.stringify(canvas.value.toJSON(['customType', 'bubbleText', 'originalName']))
      
      // 移除当前索引之后的所有状态（用于处理分支历史）
      historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
      
      // 添加新状态
      historyStack.value.push(state)
      
      // 限制历史记录数量（最多50个状态）
      if (historyStack.value.length > 50) {
        historyStack.value.shift()
      } else {
        historyIndex.value++
      }
      
      updateUndoRedoState()
    }

    const undo = () => {
      if (!canUndo.value || !canvas.value) return
      
      historyIndex.value--
      const state = historyStack.value[historyIndex.value]
      
      canvas.value.loadFromJSON(state, () => {
        canvas.value.renderAll()
        updateBubblesFromCanvas()
        updateUndoRedoState()
      })
    }

    const redo = () => {
      if (!canRedo.value || !canvas.value) return
      
      historyIndex.value++
      const state = historyStack.value[historyIndex.value]
      
      canvas.value.loadFromJSON(state, () => {
        canvas.value.renderAll()
        updateBubblesFromCanvas()
        updateUndoRedoState()
      })
    }

    const updateUndoRedoState = () => {
      canUndo.value = historyIndex.value > 0
      canRedo.value = historyIndex.value < historyStack.value.length - 1
    }

    const updateBubblesFromCanvas = () => {
      // 从画布重新构建气泡数组
      bubbles.value = []
      canvas.value.getObjects().forEach(obj => {
        if (obj.customType === 'bubble') {
          bubbles.value.push({
            id: Date.now() + Math.random(),
            text: obj.bubbleText || '气泡文字',
            x: obj.left,
            y: obj.top,
            object: obj
          })
        }
      })
    }

    // 设置全局键盘事件
    const setupGlobalKeyEvents = () => {
      // 监听空格键按下和释放
      document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) {
          e.preventDefault()
          isSpacePressed = true
          if (canvas.value) {
            canvas.value.defaultCursor = 'grab'
            canvas.value.hoverCursor = 'grab'
          }
        }
      })

      document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          e.preventDefault()
          isSpacePressed = false
          isPanning = false
          isDragging.value = false
          if (canvas.value) {
            canvas.value.defaultCursor = currentTool.value === 'brush' ? 'crosshair' : 'default'
            canvas.value.hoverCursor = 'move'
            canvas.value.selection = true
          }
        }
      })
    }

    // 键盘事件处理
    const handleKeyDown = (e) => {
      // Delete 键删除选中对象
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected()
      }
      // Ctrl/Cmd + Z 撤销
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      // Ctrl/Cmd + Y 或 Ctrl/Cmd + Shift + Z 重做
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
      // Ctrl/Cmd + A 全选
      else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        const objects = canvas.value.getObjects().filter(obj => obj.selectable !== false)
        canvas.value.discardActiveObject()
        const selection = new fabric.ActiveSelection(objects, {
          canvas: canvas.value
        })
        canvas.value.setActiveObject(selection)
        canvas.value.renderAll()
      }
      // Escape 取消选择
      else if (e.key === 'Escape') {
        canvas.value.discardActiveObject()
        canvas.value.renderAll()
      }
    }

    // 调整画布大小
    const resizeCanvas = () => {
      if (canvas.value) {
        canvas.value.setDimensions({
          width: window.innerWidth,
          height: window.innerHeight
        })
        canvas.value.renderAll()
      }
    }

    // 设置工具
    const setTool = (tool) => {
      currentTool.value = tool
      
      if (tool === 'select') {
        canvas.value.isDrawingMode = false
        canvas.value.selection = true
        canvas.value.defaultCursor = 'default'
      } else if (tool === 'brush') {
        canvas.value.isDrawingMode = true
        canvas.value.freeDrawingBrush.color = brushColor.value
        canvas.value.freeDrawingBrush.width = parseInt(brushSize.value)
        canvas.value.selection = false
        canvas.value.defaultCursor = 'crosshair'
      } else {
        canvas.value.isDrawingMode = false
        canvas.value.selection = false
        canvas.value.defaultCursor = 'crosshair'
      }
    }

    // 添加图片
    const addImage = () => {
      fileInput.value.click()
    }

    // 处理文件选择
    const handleFileSelect = (event) => {
      const files = event.target.files
      if (!files.length) return

      Array.from(files).forEach(file => {
        const reader = new FileReader()
        reader.onload = (e) => {
          fabric.Image.fromURL(e.target.result, (img) => {
            // 限制图片大小
            const maxSize = 400
            if (img.width > maxSize || img.height > maxSize) {
              const scale = maxSize / Math.max(img.width, img.height)
              img.scale(scale)
            }
            
            // 设置图片属性，完全支持所有变换
            img.set({
              left: Math.random() * (canvas.value.width - img.getScaledWidth()),
              top: Math.random() * (canvas.value.height - img.getScaledHeight()),
              selectable: true,
              hasControls: true,
              hasBorders: true,
              hasRotatingPoint: true,
              lockUniScaling: false, // 允许非等比缩放
              lockScalingX: false,
              lockScalingY: false,
              lockRotation: false,
              lockMovementX: false,
              lockMovementY: false,
              transparentCorners: false,
              cornerColor: '#007AFF',
              cornerStyle: 'circle',
              cornerSize: 12,
              borderColor: '#007AFF',
              borderScaleFactor: 2,
              rotatingPointOffset: 40,
              centeredRotation: false,
              centeredScaling: false,
              customType: 'image'
            })
            
            // 添加图片元数据
            img.set('originalName', file.name)
            
            canvas.value.add(img)
            canvas.value.setActiveObject(img)
            canvas.value.renderAll()
            
            // 添加图片后保存状态
            setTimeout(() => saveState(), 100)
          }, {
            crossOrigin: 'anonymous'
          })
        }
        reader.readAsDataURL(file)
      })
      
      // 清空文件输入，允许重复选择相同文件
      event.target.value = ''
    }

    // 添加文字
    const addText = () => {
      const textContent = prompt('请输入文字内容:')
      if (!textContent) return
      
      const text = new fabric.IText(textContent, {
        left: Math.random() * (canvas.value.width - 200) + 100,
        top: Math.random() * (canvas.value.height - 100) + 50,
        fontSize: 24,
        fill: '#333333',
        fontFamily: 'Arial, sans-serif',
        selectable: true,
        hasControls: true,
        hasBorders: true,
        hasRotatingPoint: true,
        transparentCorners: false,
        cornerColor: '#007AFF',
        cornerStyle: 'circle',
        cornerSize: 10,
        borderColor: '#007AFF',
        borderScaleFactor: 2,
        padding: 5,
        customType: 'text'
      })
      
      canvas.value.add(text)
      canvas.value.setActiveObject(text)
      canvas.value.renderAll()
      
      // 添加文字后自动切换到选择工具
      setTool('select')
      
      // 添加文字后保存状态
      setTimeout(() => saveState(), 100)
    }

    // 编辑气泡
    const editBubble = (bubbleGroup) => {
      const currentText = bubbleGroup.bubbleText || '点击编辑文字'
      const newText = prompt('请输入新的描述文字:', currentText)
      if (newText === null) return // 用户取消
      
      // 更新气泡文字
      const textObj = bubbleGroup.getObjects().find(obj => obj.type === 'text')
      if (textObj) {
        textObj.set('text', newText)
        bubbleGroup.bubbleText = newText
        
        // 更新bubbles数组中对应的数据
        const bubbleIndex = bubbles.value.findIndex(bubble => bubble.object === bubbleGroup)
        if (bubbleIndex !== -1) {
          bubbles.value[bubbleIndex].text = newText
        }
        
        canvas.value.renderAll()
        
        // 编辑气泡后保存状态
        setTimeout(() => saveState(), 100)
      }
    }

    // 删除选中对象
    const deleteSelected = () => {
      const activeObjects = canvas.value.getActiveObjects()
      if (activeObjects.length) {
        activeObjects.forEach(obj => canvas.value.remove(obj))
        canvas.value.discardActiveObject()
        canvas.value.renderAll()
        
        // 删除对象后保存状态
        setTimeout(() => saveState(), 100)
      }
    }

    // 清空画布
    const clearCanvas = () => {
      if (confirm('确定要清空画布吗？')) {
        canvas.value.clear()
        canvas.value.backgroundColor = '#ffffff'
        bubbles.value = []
        canvas.value.renderAll()
        
        // 清空画布后保存状态
        setTimeout(() => saveState(), 100)
      }
    }

    // 视图控制
    const zoomIn = () => {
      const zoom = canvas.value.getZoom()
      const center = { x: canvas.value.width / 2, y: canvas.value.height / 2 }
      canvas.value.zoomToPoint(center, Math.min(zoom * 1.2, 5))
      canvas.value.renderAll()
    }

    const zoomOut = () => {
      const zoom = canvas.value.getZoom()
      const center = { x: canvas.value.width / 2, y: canvas.value.height / 2 }
      canvas.value.zoomToPoint(center, Math.max(zoom * 0.8, 0.1))
      canvas.value.renderAll()
    }

    const fitToScreen = () => {
      const objects = canvas.value.getObjects()
      if (objects.length === 0) {
        canvas.value.setZoom(1)
        canvas.value.absolutePan({ x: 0, y: 0 })
        canvas.value.renderAll()
        return
      }

      // 计算所有对象的边界
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      
      objects.forEach(obj => {
        const bound = obj.getBoundingRect()
        minX = Math.min(minX, bound.left)
        minY = Math.min(minY, bound.top)
        maxX = Math.max(maxX, bound.left + bound.width)
        maxY = Math.max(maxY, bound.top + bound.height)
      })
      
      const contentWidth = maxX - minX
      const contentHeight = maxY - minY
      const padding = 50
      
      // 计算适合的缩放比例
      const scaleX = (canvas.value.width - padding * 2) / contentWidth
      const scaleY = (canvas.value.height - padding * 2) / contentHeight
      const scale = Math.min(scaleX, scaleY, 2) // 最大放大2倍
      
      // 计算中心点
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      
      canvas.value.setZoom(scale)
      canvas.value.absolutePan({
        x: canvas.value.width / 2 - centerX * scale,
        y: canvas.value.height / 2 - centerY * scale
      })
      canvas.value.renderAll()
    }

    const focusSelected = () => {
      const activeObject = canvas.value.getActiveObject()
      if (activeObject) {
        const center = activeObject.getCenterPoint()
        const zoom = canvas.value.getZoom()
        
        canvas.value.absolutePan({ 
          x: canvas.value.width/2 - center.x * zoom, 
          y: canvas.value.height/2 - center.y * zoom 
        })
        canvas.value.renderAll()
      }
    }

    // 画布事件处理
    const handleWheel = (e) => {
      e.preventDefault()
      const delta = e.deltaY
      const zoom = canvas.value.getZoom()
      
      // 调整缩放速度，平衡鼠标和触摸板体验
      let zoomIntensity = 0.01 // 基础缩放强度
      
      // 检测是否为触摸板（通常deltaY值较小且连续）
      if (Math.abs(delta) < 10) {
        zoomIntensity = 0.005 // 触摸板使用较小的缩放强度
      }
      
      // 计算缩放因子，使用更平滑的算法
      const zoomChange = delta * zoomIntensity
      let newZoom = zoom * (1 - zoomChange)
      
      // 限制缩放范围
      newZoom = Math.max(0.1, Math.min(5, newZoom))
      
      const pointer = canvas.value.getPointer(e)
      canvas.value.zoomToPoint(pointer, newZoom)
    }

    const handleMouseDown = (e) => {
      if (currentTool.value === 'bubble') {
        createBubble(e)
      } else if (isSpacePressed) {
        // 空格键被按下时，进行画布平移
        if (e.button === 0) { // 左键
          isPanning = true
          isDragging.value = true
          lastPanPoint = { x: e.clientX, y: e.clientY }
          canvas.value.selection = false
        }
      }
      // 其他情况下，默认的选择和框选行为由 Fabric.js 自动处理
    }

    const handleMouseMove = (e) => {
      if (isPanning && isDragging.value) {
        const deltaX = e.clientX - lastPanPoint.x
        const deltaY = e.clientY - lastPanPoint.y
        
        const vpt = canvas.value.viewportTransform.slice()
        vpt[4] += deltaX
        vpt[5] += deltaY
        
        canvas.value.setViewportTransform(vpt)
        lastPanPoint = { x: e.clientX, y: e.clientY }
      }
      
      // 更新画笔设置
      if (currentTool.value === 'brush' && canvas.value.isDrawingMode) {
        canvas.value.freeDrawingBrush.color = brushColor.value
        canvas.value.freeDrawingBrush.width = parseInt(brushSize.value)
      }
    }

    const handleMouseUp = (e) => {
      if (isPanning) {
        isPanning = false
        isDragging.value = false
        if (!isSpacePressed) {
          canvas.value.selection = true
        }
      }
    }

    const handleCanvasClick = (e) => {
      // 处理画布点击
      if (currentTool.value === 'select') {
        // 点击空白区域取消选择
        if (!canvas.value.getActiveObject()) {
          canvas.value.discardActiveObject()
          canvas.value.renderAll()
        }
      }
    }

    // 创建气泡
    const createBubble = (e) => {
      // 检查是否点击到已存在的气泡
      const pointer = canvas.value.getPointer(e)
      const objects = canvas.value.getObjects()
      
      for (let obj of objects) {
        if (obj.customType === 'bubble' && obj.containsPoint(pointer)) {
          // 点击到已存在的气泡，进入编辑模式
          canvas.value.setActiveObject(obj)
          editBubble(obj)
          return
        }
      }
      
      // 没有点击到气泡，创建新气泡
      const text = prompt('请输入描述文字:')
      if (!text) return
      
      // 计算文字尺寸
      const textWidth = Math.max(text.length * 10, 80)
      const textHeight = 32
      const padding = 16
      
      // 创建气泡背景
      const bubbleBackground = new fabric.Rect({
        width: textWidth + padding * 2,
        height: textHeight + padding,
        fill: '#FFE066',
        stroke: '#FFD700',
        strokeWidth: 2,
        rx: 12,
        ry: 12,
        originX: 'center',
        originY: 'center'
      })
      
      // 创建文字
      const bubbleText = new fabric.Text(text, {
        fontSize: 14,
        fill: '#333',
        fontFamily: 'Arial, sans-serif',
        textAlign: 'center',
        originX: 'center',
        originY: 'center'
      })
      
      // 创建气泡组合
      const bubble = new fabric.Group([bubbleBackground, bubbleText], {
        left: pointer.x,
        top: pointer.y,
        selectable: true,
        hasControls: true,
        hasBorders: true,
        transparentCorners: false,
        cornerColor: '#FFD700',
        cornerStyle: 'circle',
        cornerSize: 10,
        borderColor: '#FFD700',
        customType: 'bubble'
      })
      
      // 存储文字内容到气泡对象
      bubble.bubbleText = text
      
      canvas.value.add(bubble)
      bubbles.value.push({
        id: Date.now(),
        text: text,
        x: pointer.x,
        y: pointer.y,
        object: bubble
      })
      canvas.value.setActiveObject(bubble)
      canvas.value.renderAll()
      
      // 创建完成后自动切换到选择工具
      setTool('select')
    }

    // 检查API密钥
    const checkApiKey = () => {
      const apiKey = localStorage.getItem('ai_api_key')
      if (!apiKey) {
        showApiKeyDialog.value = true
        return false
      }
      aiImageService.setApiKey(apiKey)
      return true
    }

    // 保存API密钥
    const saveApiKey = () => {
      if (tempApiKey.value.trim()) {
        localStorage.setItem('ai_api_key', tempApiKey.value.trim())
        aiImageService.setApiKey(tempApiKey.value.trim())
        showApiKeyDialog.value = false
        tempApiKey.value = ''
        
        // 如果是从AI生成触发的，重新打开AI面板
        if (showAIPanel.value === false) {
          showAIPanel.value = true
        }
      }
    }

    // 处理AI生成
    const handleAIGenerate = async (params) => {
      try {
        showAIPanel.value = false
        
        // 创建加载矩形
        const centerX = canvas.value.width / 2
        const centerY = canvas.value.height / 2
        
        // 计算加载矩形尺寸，保持与输出图片相同的宽高比
        const targetWidth = params.outputSize.width
        const targetHeight = params.outputSize.height
        const aspectRatio = targetWidth / targetHeight
        
        // 设置最大显示尺寸限制
        const maxDisplayWidth = 400
        const maxDisplayHeight = 300
        
        let displayWidth, displayHeight
        
        // 根据宽高比和最大限制计算实际显示尺寸
        if (aspectRatio > maxDisplayWidth / maxDisplayHeight) {
          // 图片更宽，以宽度为准
          displayWidth = Math.min(targetWidth, maxDisplayWidth)
          displayHeight = displayWidth / aspectRatio
        } else {
          // 图片更高，以高度为准
          displayHeight = Math.min(targetHeight, maxDisplayHeight)
          displayWidth = displayHeight * aspectRatio
        }
        
        currentAILoader.value = new AILoadingRect(canvas.value, {
          left: centerX,
          top: centerY,
          width: displayWidth,
          height: displayHeight,
          targetWidth,  // 传递目标宽度用于生成
          targetHeight  // 传递目标高度用于生成
        })
        
        // 调用AI图像生成服务
        const result = await aiImageService.generateImage(params, (progress) => {
          if (currentAILoader.value) {
            currentAILoader.value.updateStatus(progress.message)
          }
        })
        
        // 生成成功，替换为图片
        if (result.success && result.images.length > 0) {
          const generatedImage = result.images[0]
          await currentAILoader.value.replaceWithImage(generatedImage.url, result)
          
          // 保存状态
          setTimeout(() => saveState(), 100)
          
          alert('AI图像生成成功！点击图片选中后可查看详情。')
        } else {
          throw new Error('没有生成图像数据')
        }
        
      } catch (error) {
        console.error('AI生成失败:', error)
        
        if (currentAILoader.value) {
          currentAILoader.value.showError(error.message)
          // 3秒后自动销毁失败的加载器
          setTimeout(() => {
            if (currentAILoader.value) {
              currentAILoader.value.destroy()
              currentAILoader.value = null
            }
          }, 3000)
        }
        
        alert('AI生成失败: ' + error.message)
      } finally {
        currentAILoader.value = null
      }
    }

    // 原有的生成AI数据功能（保留用于调试）
    const generateAIData = async () => {
      try {
        // 取消所有选择，确保截图干净
        canvas.value.discardActiveObject()
        canvas.value.renderAll()
        
        // 等待渲染完成
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // 计算有内容的区域
        const allObjects = canvas.value.getObjects()
        let contentBounds = null
        
        if (allObjects.length > 0) {
          // 过滤有效的内容对象，排除辅助对象
          const contentObjects = allObjects.filter(obj => {
            return obj.visible !== false && 
                   obj.opacity > 0 && 
                   obj.width > 0 && 
                   obj.height > 0
          })
          
          if (contentObjects.length > 0) {
            // 计算所有内容对象的精确边界
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
            
            contentObjects.forEach(obj => {
              const bound = obj.getBoundingRect()
              minX = Math.min(minX, bound.left)
              minY = Math.min(minY, bound.top)
              maxX = Math.max(maxX, bound.left + bound.width)
              maxY = Math.max(maxY, bound.top + bound.height)
            })
            
            // 使用更小的padding，并确保不超出画布范围
            const padding = 15
            const actualLeft = Math.max(0, Math.floor(minX - padding))
            const actualTop = Math.max(0, Math.floor(minY - padding))
            const actualRight = Math.min(canvas.value.width, Math.ceil(maxX + padding))
            const actualBottom = Math.min(canvas.value.height, Math.ceil(maxY + padding))
            
            contentBounds = {
              left: actualLeft,
              top: actualTop,
              width: actualRight - actualLeft,
              height: actualBottom - actualTop
            }
          } else {
            // 如果没有有效内容对象，使用默认中心区域
            contentBounds = {
              left: canvas.value.width / 4,
              top: canvas.value.height / 4,
              width: canvas.value.width / 2,
              height: canvas.value.height / 2
            }
          }
        } else {
          // 如果没有对象，截取中心区域
          contentBounds = {
            left: canvas.value.width / 4,
            top: canvas.value.height / 4,
            width: canvas.value.width / 2,
            height: canvas.value.height / 2
          }
        }
        
        // 生成有内容区域的截图
        const canvasElement = canvas.value.getElement()
        
        // 先生成完整截图，然后裁剪，这样更精确
        const fullScreenshot = await html2canvas(canvasElement, {
          backgroundColor: '#ffffff',
          scale: 1,
          useCORS: true,
          allowTaint: true
        })
        
        // 创建裁剪后的画布
        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = contentBounds.width
        cropCanvas.height = contentBounds.height
        const cropCtx = cropCanvas.getContext('2d')
        
        // 裁剪指定区域
        cropCtx.drawImage(
          fullScreenshot,
          contentBounds.left, contentBounds.top, contentBounds.width, contentBounds.height,
          0, 0, contentBounds.width, contentBounds.height
        )
        
        // 将裁剪后的canvas转换为blob
        const screenshot = cropCanvas
        
        // 获取所有对象的详细信息  
        const objectsData = allObjects.map((obj, index) => {
          const bound = obj.getBoundingRect()
          const center = obj.getCenterPoint()
          
          return {
            id: index,
            type: obj.type || 'unknown',
            name: obj.name || `Object ${index}`,
            position: {
              x: center.x,
              y: center.y,
              left: bound.left,
              top: bound.top
            },
            size: {
              width: bound.width,
              height: bound.height
            },
            properties: {
              visible: obj.visible,
              selectable: obj.selectable,
              opacity: obj.opacity || 1,
              angle: obj.angle || 0
            }
          }
        })
        
        // 创建详细的AI数据
        const aiData = {
          metadata: {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            generator: 'AI Interactive Whiteboard'
          },
          canvas: {
            size: {
              width: canvas.value.width,
              height: canvas.value.height
            },
            viewport: {
              zoom: canvas.value.getZoom(),
              pan: {
                x: canvas.value.viewportTransform[4],
                y: canvas.value.viewportTransform[5]
              }
            },
            backgroundColor: canvas.value.backgroundColor,
            contentBounds: contentBounds
          },
          annotations: {
            bubbles: bubbles.value.map(bubble => ({
              id: bubble.id,
              text: bubble.text,
              position: { x: bubble.x, y: bubble.y },
              type: 'description',
              timestamp: new Date(bubble.id).toISOString()
            }))
          },
          objects: objectsData,
          statistics: {
            totalObjects: allObjects.length,
            bubblesCount: bubbles.value.length,
            imagesCount: allObjects.filter(obj => obj.customType === 'image').length,
            textsCount: allObjects.filter(obj => obj.customType === 'text').length,
            drawingsCount: allObjects.filter(obj => obj.customType === 'drawing').length
          }
        }
        
        // 生成文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        
        // 下载截图
        screenshot.toBlob((blob) => {
          saveAs(blob, `ai-whiteboard-screenshot-${timestamp}.png`)
        }, 'image/png')
        
        // 下载JSON数据
        const dataStr = JSON.stringify(aiData, null, 2)
        const dataBlob = new Blob([dataStr], { type: 'application/json' })
        saveAs(dataBlob, `ai-whiteboard-data-${timestamp}.json`)
        
        showAIPanel.value = false
        alert(`AI数据已生成并下载完成！\n- 智能内容截图 (仅包含有内容区域)\n- 结构化数据文件 (JSON)\n- 截图尺寸: ${contentBounds.width}x${contentBounds.height}px`)
      } catch (error) {
        console.error('生成AI数据失败:', error)
        alert('生成失败，请重试: ' + error.message)
      }
    }

    // 生命周期
    onMounted(() => {
      nextTick(() => {
        initCanvas()
        // 初始化完成后保存初始状态
        setTimeout(() => saveState(), 500)
        
        // 初始化API密钥
        const savedApiKey = localStorage.getItem('ai_api_key')
        if (savedApiKey) {
          aiImageService.setApiKey(savedApiKey)
        }
      })
    })

    return {
      // refs
      canvasContainer,
      fabricCanvas,
      fileInput,
      canvas,
      
      // 状态
      currentTool,
      isDragging,
      showAIPanel,
      bubbles,
      brushColor,
      brushSize,
      canUndo,
      canRedo,
      
      // 方法
      setTool,
      addImage,
      addText,
      deleteSelected,
      clearCanvas,
      handleFileSelect,
      editBubble,
      undo,
      redo,
      
      // 视图控制
      zoomIn,
      zoomOut,
      fitToScreen,
      focusSelected,
      
      // 事件处理
      handleWheel,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleCanvasClick,
      
      // AI功能
      generateAIData,
      handleAIGenerate,
      handleAIButtonClick: () => {
        // 直接打开AI面板，不再咨询API密钥
        showAIPanel.value = true
      },
      
      // API密钥管理
      showApiKeyDialog,
      tempApiKey,
      saveApiKey
    }
  }
}
</script>

<style scoped>
/* API密钥对话框样式 */
.api-key-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  border-radius: 16px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.15);
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  z-index: 2000;
}

.api-key-dialog h3 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
}

.api-key-dialog p {
  color: #666;
  margin-bottom: 20px;
  line-height: 1.5;
  font-size: 14px;
}

.api-key-input {
  width: 100%;
  border: 2px solid #eee;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  margin-bottom: 20px;
  transition: border-color 0.2s;
}

.api-key-input:focus {
  outline: none;
  border-color: #4ECDC4;
}

.api-key-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancel-btn,
.save-btn {
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

.save-btn {
  background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
  color: white;
}

.save-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
}

@media (max-width: 600px) {
  .api-key-dialog {
    width: 95vw;
    margin: 20px;
    min-width: unset;
  }
  
  .api-key-actions {
    flex-direction: column;
  }
  
  .cancel-btn,
  .save-btn {
    width: 100%;
  }
}
</style>
