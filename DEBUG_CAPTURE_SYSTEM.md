# 图像截取调试系统

## 🔍 问题诊断

您反馈预览参数看起来正确，但截取的图片显示不对，可能存在位置偏移。为了彻底排查这个问题，我添加了完整的调试系统。

## 🛠 调试功能

### 1. 控制台详细日志

**对象边界信息**：
```javascript
Object type: image, Bound: {left: 150, top: 200, width: 300, height: 250}
Object coords - left: 150, top: 200
Object size - width: 300, height: 250
```

**预览绘制信息**：
```javascript
=== 预览绘制时的调试信息 ===
Preview canvas size: 200 x 150
Content bounds: {left: 130, top: 180, width: 340, height: 290}
Preview drawing params: {scale: 0.5, scaledWidth: 170, scaledHeight: 145, ...}
```

**实际生成信息**：
```javascript
=== 实际生成时的调试信息 ===
Canvas element size: 1200 x 800
Fabric canvas size: 1200 x 800
Device pixel ratio: 2
Content bounds: {left: 130, top: 180, width: 340, height: 290}
Viewport transform: [1, 0, 0, 1, 0, 0]
Canvas zoom: 1
Size ratio - Fabric vs DOM: {widthRatio: 1, heightRatio: 1}
```

### 2. 自动下载截取图片

- 每次生成时自动下载实际截取的图片
- 文件名：`debug-cropped-image-[timestamp].png`
- 您可以对比这个图片与预览是否一致

### 3. 界面调试信息

- 预览下方显示：`截取区域: 130,180 340×290`
- 实时更新，反映当前计算的边界

## 🔧 可能的问题源

### 1. 设备像素比问题
- **症状**: 高DPI屏幕上坐标偏移
- **检查**: 控制台中的 `Device pixel ratio` 值
- **表现**: 如果比例≠1，可能需要坐标转换

### 2. Fabric vs DOM Canvas尺寸不匹配
- **症状**: Fabric canvas和DOM canvas尺寸不一致
- **检查**: 控制台中的 `Size ratio` 值
- **表现**: 如果比例≠1，坐标系需要转换

### 3. 画布变换影响
- **症状**: 用户缩放/平移了画布
- **检查**: `Canvas zoom` 和 `Viewport transform` 值
- **表现**: 如果zoom≠1或transform有偏移，坐标需要转换

### 4. 对象边界计算错误
- **症状**: getBoundingRect返回的坐标不准确
- **检查**: 对比 `Object coords` 和 `Bound` 值
- **表现**: 边界与实际对象位置不符

## 📋 调试步骤

### 第一步：查看控制台日志
1. 打开浏览器开发者工具（F12）
2. 切换到Console标签
3. 上传图片并选中
4. 点击AI生成按钮
5. 查看详细的调试信息

### 第二步：下载对比图片
1. 点击"开始生成"
2. 会自动下载 `debug-cropped-image-*.png`
3. 对比下载的图片与预览是否一致
4. 检查截取的内容是否正确

### 第三步：分析问题
根据调试信息判断问题类型：

**情况A：设备像素比问题**
```
Device pixel ratio: 2
Canvas element size: 2400 x 1600  (物理像素)
Fabric canvas size: 1200 x 800    (逻辑像素)
```
→ 需要坐标除以devicePixelRatio

**情况B：画布变换问题**
```
Canvas zoom: 1.5
Viewport transform: [1.5, 0, 0, 1.5, 100, 50]
```
→ 需要考虑缩放和平移

**情况C：尺寸不匹配问题**
```
Size ratio: {widthRatio: 0.5, heightRatio: 0.5}
```
→ 需要坐标按比例转换

## 🔧 预期修复方案

根据调试结果，可能的修复方案：

### 方案A：坐标系转换
```javascript
// 考虑设备像素比
const pixelRatio = window.devicePixelRatio || 1
const adjustedBound = {
  left: bound.left / pixelRatio,
  top: bound.top / pixelRatio,
  width: bound.width / pixelRatio,
  height: bound.height / pixelRatio
}
```

### 方案B：画布变换补偿
```javascript
// 考虑画布缩放和平移
const vpt = props.canvas.viewportTransform
const zoom = props.canvas.getZoom()
const adjustedCoords = fabric.util.transformPoint(
  {x: bound.left, y: bound.top}, 
  vpt
)
```

### 方案C：使用Fabric API
```javascript
// 使用fabric的数据导出功能
const dataURL = props.canvas.toDataURL({
  left: bound.left,
  top: bound.top,
  width: bound.width,
  height: bound.height
})
```

## 📊 调试报告模板

请提供以下信息帮助诊断：

### 基本信息
- [ ] 操作系统：_______
- [ ] 浏览器：_______
- [ ] 屏幕分辨率：_______
- [ ] 是否为高DPI屏幕：_______

### 调试数据
请从控制台复制以下信息：
- [ ] Device pixel ratio: _______
- [ ] Canvas element size: _______
- [ ] Fabric canvas size: _______  
- [ ] Size ratio: _______
- [ ] Canvas zoom: _______
- [ ] Viewport transform: _______

### 现象描述
- [ ] 预览显示：_______
- [ ] 下载图片显示：_______
- [ ] 实际偏移情况：_______

## 🎯 下一步

1. **请运行调试系统**，提供控制台输出
2. **下载并检查**截取的图片
3. **描述具体偏移**情况（向左/右/上/下偏移多少）
4. 基于调试信息，我会提供**精确的修复方案**

---

**目标**: 通过这个调试系统，我们能够精确定位问题根源，然后实施针对性的修复。🔍✨
