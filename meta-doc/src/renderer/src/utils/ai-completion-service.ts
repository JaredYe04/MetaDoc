/**
 * AI自动补全核心服务
 * 后台监听编辑器变化，异步生成补全，不阻塞用户输入
 */

import { ref } from 'vue'
import type { Ref } from 'vue'
import { getSetting } from './settings'
import { suggestionCompletionPrompt } from './prompts'
import { createAiTask, cancelAiTask, ai_types } from './ai_tasks'
import { createRendererLogger } from './logger'
import eventBus, { getWindowType } from './event-bus'



/**
 * 编辑器适配器接口
 * 用于抽象不同编辑器（Markdown/Vditor, LaTeX/Monaco）的操作
 */
export interface EditorAdapter {
  /** 获取编辑器ID（用于标识编辑器实例） */
  getEditorId(): string | null
  
  /** 获取当前光标位置 */
  getCursorPosition(): { line: number; column: number } | null
  
  /** 获取光标附近的上下文（前后各contextSize个字符） */
  getContextAroundCursor(contextSize?: number): { preContext: string; postContext: string } | null
  
  /** 获取完整文档内容 */
  getFullText(): string
  
  /** 检查编辑器是否处于活动状态 */
  isActive(): boolean
  
  /** 检查光标是否在行尾或块尾（用于判断是否应该触发补全） */
  isCursorAtLineEnd(): boolean
  
  /** 获取当前行的内容 */
  getCurrentLineContent(): string | null
  
  /** 获取最后一个输入的字符（用于关键字符检测） */
  getLastChar(): string | null
}

/**
 * 修改请求类型
 * 类似Cursor的edit request机制
 */
export interface EditRequest {
  /** 修改类型 */
  type: 'insert' | 'replace' | 'delete'
  
  /** 目标位置（行号从1开始，列号从1开始） */
  range: {
    start: { line: number; column: number }
    end: { line: number; column: number }
  }
  
  /** 新内容（对于insert和replace） */
  content?: string
  
  /** 请求ID */
  id: string
  
  /** 生成时间戳 */
  timestamp: number
}

/**
 * 补全状态
 */
interface CompletionState {
  /** 当前正在生成的补全请求 */
  currentRequest: EditRequest | null
  
  /** 当前生成的文本 */
  generatedText: string
  
  /** 是否正在生成 */
  isGenerating: boolean
  
  /** AI任务句柄 */
  taskHandle: any | null
}

/**
 * AI补全服务类
 */
class AICompletionService {
  private adapter: EditorAdapter | null = null
  private state: CompletionState = {
    currentRequest: null,
    generatedText: '',
    isGenerating: false,
    taskHandle: null
  }
  
  /** 延迟到期时间（时间戳） */
  private delayUntil: number = 0
  
  /** 是否启用自动补全 */
  private enabled: boolean = true
  
  /** UI层防抖定时器（第一层：输入防抖） */
  private uiDebounceTimer: NodeJS.Timeout | null = null
  
  /** AI调用层防抖定时器（第二层：AI请求防抖） */
  private aiDebounceTimer: NodeJS.Timeout | null = null
  
  /** UI层防抖延迟（毫秒）- 用于输入事件 */
  private readonly UI_DEBOUNCE_DELAY = 600
  
  /** AI调用层防抖延迟（毫秒）- 主动状态：600ms */
  private readonly AI_DEBOUNCE_DELAY_ACTIVE = 600
  
  /** AI调用层防抖延迟（毫秒）- 被动状态：3000ms */
  private readonly AI_DEBOUNCE_DELAY_PASSIVE = 3000
  
  /** 快速打字检测：记录输入时间戳 */
  private inputTimestamps: number[] = []
  
  /** 补全模式状态：'active'（主动）或 'passive'（被动） */
  private completionMode: 'active' | 'passive' = 'active'
  
  /** 最近按下的Enter键时间戳（用于检测Enter键导致的输入事件） */
  private lastEnterKeyTime: number = 0
  
  /** 在triggerCompletion时保存的状态，用于shouldTriggerCompletion中计算延迟 */
  private savedCompletionMode: 'active' | 'passive' | null = null
  
  /** 快速打字阈值：300ms内输入超过4次字符 */
  private readonly FAST_TYPING_THRESHOLD = 4
  private readonly FAST_TYPING_WINDOW = 300
  
  /** 上下文大小（优化为500字符） */
  private readonly CONTEXT_SIZE = 500
  
  /** 补全最大长度（2-3行，40-80字符） */
  private readonly MAX_COMPLETION_LENGTH = 80
  
  /** 监听器清理函数 */
  private cleanupListeners: (() => void)[] = []
  
  /**
   * 设置编辑器适配器
   */
  setAdapter(adapter: EditorAdapter) {
    this.adapter = adapter
    this.setupListeners()
  }
  
  /**
   * 移除适配器
   */
  removeAdapter() {
    this.cancelCurrentCompletion()
    this.cleanupListeners.forEach(cleanup => cleanup())
    this.cleanupListeners = []
    this.adapter = null
  }
  
  /**
   * 获取当前适配器（用于外部检查）
   */
  getAdapter(): EditorAdapter | null {
    return this.adapter
  }
  
  /**
   * 设置监听器
   */
  private setupListeners() {
    
    // 监听设置变化
    const updateEnabled = async () => {
      this.enabled = await getSetting('autoCompletion') ?? true
      if (!this.enabled) {
        this.cancelCurrentCompletion()
      }
    }
    updateEnabled()
    
    // 监听延迟变化
    eventBus.on('ai-completion-delay', (minutes: unknown) => {
      this.delay(typeof minutes === 'number' ? minutes : 5)
    })
    
    // 监听取消延迟事件
    eventBus.on('ai-completion-cancel-delay', () => {
      this.cancelDelay()
    })
    
    // 监听取消事件
    eventBus.on('cancel-suggestion', () => {
      this.cancelCurrentCompletion()
    })
    
    this.cleanupListeners.push(() => {
      eventBus.off('ai-completion-delay')
      eventBus.off('ai-completion-cancel-delay')
      eventBus.off('cancel-suggestion')
    })
  }
  
  /**
   * 延迟补全（分钟）
   * 如果原本没有延迟，就延迟指定分钟数
   * 如果原本已经有剩余时间，就在剩余时间基础上累加
   */
  delay(minutes: number = 5) {
    const now = Date.now()
    
    // 如果当前没有延迟或已过期，从当前时间开始计算
    // 如果还有剩余延迟，在剩余时间基础上累加
    const baseTime = this.delayUntil > now ? this.delayUntil : now
    this.delayUntil = baseTime + minutes * 60 * 1000
    
    // 取消当前补全
    this.cancelCurrentCompletion()
    
    // 通知UI更新
    eventBus.emit('ai-completion-delay-updated', this.delayUntil)
  }
  
  /**
   * 取消延迟
   */
  cancelDelay() {
    this.delayUntil = 0
    
    // 通知UI更新
    eventBus.emit('ai-completion-delay-updated', this.delayUntil)
  }
  
  /**
   * 获取剩余延迟时间（秒）
   */
  getRemainingDelay(): number {
    if (this.delayUntil <= Date.now()) {
      return 0
    }
    return Math.ceil((this.delayUntil - Date.now()) / 1000)
  }
  
  /**
   * 检查是否可以触发补全
   */
  private canTrigger(): boolean {
    if (!this.enabled) return false
    if (!this.adapter) return false
    if (!this.adapter.isActive()) return false
    if (this.delayUntil > Date.now()) return false
    if (this.state.isGenerating) return false
    return true
  }
  
  /**
   * 触发补全（双层防抖 + 主动/被动状态管理）
   * 第一层：UI层防抖（600ms）- 用户停止输入后触发检查
   * 第二层：AI调用层防抖（根据主动/被动状态调整延迟）
   *   - 主动状态：600ms（快速触发）
   *   - 被动状态：3000ms（慢速触发）
   */
  triggerCompletion(triggerType: 'input' | 'key' | 'manual' = 'input', key?: string) {
    const logger = createRendererLogger('AICompletionService', {
      windowTypeProvider: () => getWindowType()
    })
    
    // Tab键不应该触发补全或状态切换（Tab键用于接受补全）
    if (triggerType === 'key' && (key === 'Tab' || key === 'tab')) {
      return
    }
    
    // 手动触发：跳过所有防抖，立即执行，并切换为主动状态
    if (triggerType === 'manual') {
      // 清除所有防抖定时器
      if (this.uiDebounceTimer) {
        clearTimeout(this.uiDebounceTimer)
        this.uiDebounceTimer = null
      }
      if (this.aiDebounceTimer) {
        clearTimeout(this.aiDebounceTimer)
        this.aiDebounceTimer = null
      }
      // 手动触发时切换为主动状态
      const oldMode = this.completionMode
      this.completionMode = 'active'
      if (oldMode !== 'active') {
        logger.info('[主动/被动模式] 手动触发补全，从被动切换到主动状态')
      }
      // 立即执行，跳过所有防抖和检查，直接开始补全
      this.startCompletion()
      return
    }
    
    // 保存当前状态，用于shouldTriggerCompletion中计算延迟
    // 这样即使状态在600ms内被切换，延迟计算也会使用正确的状态
    this.savedCompletionMode = this.completionMode
    
    // 记录输入时间戳（用于快速打字检测）
    if (triggerType === 'input') {
      const now = Date.now()
      this.inputTimestamps.push(now)
      // 只保留最近1秒内的记录
      this.inputTimestamps = this.inputTimestamps.filter(ts => now - ts < 1000)
      
      // 检查是否是Enter键导致的输入事件（通过检查最近是否有Enter键被按下）
      // Enter键不应该触发被动状态
      // 使用500ms的时间窗口，因为onDidChangeModelContent可能在onKeyDown之后延迟触发
      const isEnterKey = this.lastEnterKeyTime > 0 && (now - this.lastEnterKeyTime) < 500
      
      // 如果当前是主动状态，用户输入后切换到被动状态
      // 但是Enter键不应该触发被动状态
      if (this.completionMode === 'active' && !isEnterKey) {
        this.completionMode = 'passive'
        logger.info('[主动/被动模式] 用户输入，从主动切换到被动状态')
      } else if (isEnterKey) {
        // 清除Enter键时间戳，避免影响后续的输入事件
        const timeSinceEnter = now - this.lastEnterKeyTime
        this.lastEnterKeyTime = 0
        logger.info('[主动/被动模式] Enter键输入，保持当前状态', { 
          mode: this.completionMode,
          timeSinceEnter: `${timeSinceEnter}ms`
        })
      }
    }
    
    // 对于按键触发，只有非Enter/Space/Tab的触发键（;、,）才会切换到被动状态
    // Enter和Space保持当前状态（不切换到被动）
    // Tab键已经在上面被排除，不会走到这里
    if (triggerType === 'key' && this.completionMode === 'active') {
      // Enter和Space不切换到被动状态
      if (key !== 'Enter' && key !== 'Space' && key !== 'Return' && key !== ' ') {
        this.completionMode = 'passive'
        logger.info('[主动/被动模式] 用户按触发键，从主动切换到被动状态', { key })
      } else if (key === 'Enter' || key === 'Return') {
        // 记录Enter键按下的时间戳，用于后续检测Enter键导致的输入事件
        this.lastEnterKeyTime = Date.now()
      }
    }
    
    // 清除UI层防抖定时器
    if (this.uiDebounceTimer) {
      clearTimeout(this.uiDebounceTimer)
    }
    
    // 第一层防抖：UI层（600ms）
    this.uiDebounceTimer = setTimeout(() => {
      this.uiDebounceTimer = null
      this.shouldTriggerCompletion(triggerType, key)
    }, this.UI_DEBOUNCE_DELAY)
  }
  
  /**
   * 检查是否应该触发补全（第一层防抖后的检查）
   */
  private shouldTriggerCompletion(triggerType: 'input' | 'key' | 'manual', key?: string) {
    const logger = createRendererLogger('AICompletionService', {
      windowTypeProvider: () => getWindowType()
    })
    
    if (!this.canTrigger()) {
      return
    }
    
    if (!this.adapter) {
      return
    }
    
    // 原则1：检查用户是否正在快速打字
    if (this.isUserTypingFast()) {
      return
    }
    
    
    // 原则2：检查按键触发（对于key类型）
    if (triggerType === 'key') {
      if (key && !this.isTriggerKey(key)) {
        return
      }
    }
    
    // 清除AI调用层防抖定时器（第二层防抖）
    if (this.aiDebounceTimer) {
      clearTimeout(this.aiDebounceTimer)
    }
    
    // 第二层防抖：AI调用层（根据主动/被动状态调整延迟）
    // 使用保存的状态（savedCompletionMode）来计算延迟，而不是当前状态
    // 这样可以确保延迟计算使用的是triggerCompletion时的状态，而不是600ms后的状态
    const modeForDelay = this.savedCompletionMode ?? this.completionMode
    const aiDebounceDelay = modeForDelay === 'active' 
      ? this.AI_DEBOUNCE_DELAY_ACTIVE 
      : this.AI_DEBOUNCE_DELAY_PASSIVE
    
    logger.info('[主动/被动模式] 准备触发补全', {
      mode: this.completionMode,
      savedMode: this.savedCompletionMode,
      modeForDelay,
      delay: aiDebounceDelay,
      triggerType,
      key
    })
    
    // 清除保存的状态
    this.savedCompletionMode = null
    
    this.aiDebounceTimer = setTimeout(() => {
      this.aiDebounceTimer = null
      this.startCompletion()
    }, aiDebounceDelay)
  }
  
  /**
   * 检查用户是否正在快速打字
   * 如果过去300ms内输入了>4次字符，则认为用户处于typing状态
   */
  private isUserTypingFast(): boolean {
    const now = Date.now()
    const recentInputs = this.inputTimestamps.filter(ts => now - ts < this.FAST_TYPING_WINDOW)
    return recentInputs.length > this.FAST_TYPING_THRESHOLD
  }
  
  /**
   * 检查是否是关键字符（触发补全的字符）
   */
  private isTriggerCharacter(char: string): boolean {
    // 列表标记
    if (char === '-' || char === '*' || char === '1' || char === '2' || char === '3' || char === '4' || char === '5' || char === '6' || char === '7' || char === '8' || char === '9') {
      return true
    }
    
    // 标题标记
    if (char === '#') {
      return true
    }
    
    // 引用标记
    if (char === '>') {
      return true
    }
    
    // 代码块标记
    if (char === '`') {
      return true
    }
    
    // 段落结尾（句号、问号、感叹号）
    if (char === '。' || char === '.' || char === '?' || char === '？' || char === '!' || char === '！') {
      return true
    }
    
    // 变量、引用（左括号、左方括号）
    if (char === '(' || char === '[') {
      return true
    }
    
    // 换行符
    if (char === '\n') {
      return true
    }
    
    return false
  }
  
  /**
   * 检查是否是触发按键
   */
  private isTriggerKey(key: string): boolean {
    // Enter键
    if (key === 'Enter' || key === 'Return') {
      return true
    }
    
    // Space键
    if (key === 'Space' || key === ' ') {
      return true
    }
    
    // 分号、逗号
    if (key === ';' || key === ',' || key === 'Semicolon' || key === 'Comma') {
      return true
    }
    
    return false
  }
  
  /**
   * 开始补全
   */
  private async startCompletion() {
    const logger = createRendererLogger('AICompletionService', {
      windowTypeProvider: () => getWindowType()
    })
    if (!this.canTrigger()) return
    if (!this.adapter) return
    
    // 取消之前的补全
    this.cancelCurrentCompletion()
    
    // 获取光标位置（先获取，用于日志）
    const cursorPos = this.adapter.getCursorPosition()
    if (!cursorPos) {
      logger.warn('无法获取光标位置，取消补全')
      return
    }
    
    // 获取当前行内容（用于优化上下文）
    const currentLine = this.adapter.getCurrentLineContent()
    
    // 获取上下文（优化为500字符）
    const context = this.adapter.getContextAroundCursor(this.CONTEXT_SIZE)
    if (!context) {
      logger.warn('无法获取上下文，取消补全', { cursorPosition: cursorPos })
      return
    }
    
    // 获取文档类型（从编辑器ID推断：tex或md）
    const editorId = this.adapter.getEditorId()
    const documentType = editorId === 'vditor' ? 'Markdown' : 'LaTeX'
    
    // 创建修改请求
    const request: EditRequest = {
      type: 'insert',
      range: {
        start: cursorPos,
        end: cursorPos
      },
      id: `completion-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    }
    
    this.state.currentRequest = request
    this.state.isGenerating = true
    this.state.generatedText = ''
    
    // 生成提示词（优化：包含当前行内容和文档类型）
    // 只使用preContext，去掉postContext，避免大模型幻觉
    const prompt = suggestionCompletionPrompt(
      context.preContext, 
      '', // 不使用postContext
      currentLine || '',
      documentType
    )
    
    // 记录实际发送给AI的prompt内容，用于调试
    logger.info('发送给AI的补全提示词', {
      documentType,
      currentLine: currentLine || '(空行)',
      preContextLength: context.preContext.length,
      preContextLast100: context.preContext.slice(-100),
      systemPrompt: prompt[0]?.content?.substring(0, 200) + '...',
      userPrompt: prompt[1]?.content?.substring(0, 300) + '...',
      fullUserPrompt: prompt[1]?.content
    })
    
    // 创建AI任务
    const autoCompletionMode = await getSetting('autoCompletionMode')
    const autoCompletionMaxTokens = await getSetting('autoCompletionMaxTokens') || 50
    
    try {
      // 创建响应式引用用于接收生成的文本
      const generatedTextRef = ref('')
      
      // 使用Object.defineProperty监听ref的变化（不依赖Vue watch）
      let lastValue = ''
      const checkTextUpdate = () => {
        const currentValue = generatedTextRef.value
        if (currentValue !== lastValue) {
          lastValue = currentValue
          this.state.generatedText = currentValue
          
          // 记录生成的文本内容
          if (currentValue.trim()) {
            // 注意：不要截断文本！应该使用完整文本插入到编辑器
            // 截断只应该在UI预览时进行，但实际插入应该使用完整文本
            // 这样可以确保用户接受时获得完整的补全内容
            
            logger.info('AI补全文本更新', {
              length: currentValue.length,
              fullText: currentValue,
              linesCount: currentValue.split('\n').length
            })
            
            // 有内容时通知UI显示（使用完整文本）
            const eventData = {
              request: this.state.currentRequest,
              text: currentValue  // 使用完整文本，不要截断
            }
            
            eventBus.emit('ai-completion-text-updated', eventData)
          }
        }
      }
      
      // 定期检查文本更新（用于流式输出）
      const checkInterval = setInterval(() => {
        checkTextUpdate()
      }, 100)
      
      // 确保 prompt 的类型正确（AIDialogMessage[]）
      const typedPrompt = prompt as any
      
      // 构建meta对象，包含max_tokens限制（如果设置了）
      const meta: any = {
        stream: !(autoCompletionMode === 'full')
      }
      
      // 如果设置了max_tokens限制（>0），则添加到meta中
      if (autoCompletionMaxTokens > 0) {
        meta.max_tokens = autoCompletionMaxTokens
      }
      
      const { handle, done } = createAiTask(
        'AI自动补全',
        typedPrompt,
        generatedTextRef,
        ai_types.chat,
        'AI自动补全',
        meta
      )
      
      this.state.taskHandle = handle
      
      // 等待任务完成
      done.then(() => {
        clearInterval(checkInterval)
        checkTextUpdate() // 最后一次检查
        
        if (this.state.generatedText.trim()) {
          logger.info('AI补全生成完成', {
            textLength: this.state.generatedText.length,
            fullText: this.state.generatedText
          })
        } else {
          logger.warn('AI补全生成完成但内容为空，取消补全')
          // 如果没有生成内容，取消补全
          this.cancelCurrentCompletion()
        }
      }).catch((error) => {
        clearInterval(checkInterval)
        logger.error('AI补全任务失败', error)
        this.cancelCurrentCompletion()
      })
      
      // 保存清理函数
      const originalCleanup = this.cleanupListeners
      this.cleanupListeners = [
        ...originalCleanup,
        () => clearInterval(checkInterval)
      ]
      
    } catch (error) {
      logger.error('创建AI补全任务失败', error)
      this.cancelCurrentCompletion()
    }
  }
  
  /**
   * 取消当前补全（用户继续打字时立即调用）
   * 注意：取消补全时保持当前状态（被动状态保持被动，主动状态保持主动）
   */
  cancelCurrentCompletion() {
    // 清除所有防抖定时器
    if (this.uiDebounceTimer) {
      clearTimeout(this.uiDebounceTimer)
      this.uiDebounceTimer = null
    }
    
    if (this.aiDebounceTimer) {
      clearTimeout(this.aiDebounceTimer)
      this.aiDebounceTimer = null
    }
    
    // 中断当前AI请求
    if (this.state.taskHandle) {
      cancelAiTask(this.state.taskHandle, false)
      this.state.taskHandle = null
    }
    
    this.state.isGenerating = false
    this.state.currentRequest = null
    this.state.generatedText = ''
    
    // 通知UI取消显示
    eventBus.emit('ai-completion-cancelled')
    
    // 注意：取消补全时不改变状态，保持当前状态
    // 如果当前是被动状态，保持被动状态
    // 如果当前是主动状态，保持主动状态
  }
  
  /**
   * 获取当前生成的文本
   */
  getGeneratedText(): string {
    return this.state.generatedText
  }
  
  /**
   * 获取当前请求
   */
  getCurrentRequest(): EditRequest | null {
    return this.state.currentRequest
  }
  
  /**
   * 是否正在生成
   */
  isGenerating(): boolean {
    return this.state.isGenerating
  }
  
  /**
   * 接受补全
   */
  acceptCompletion(): boolean {
    if (!this.state.currentRequest || !this.state.generatedText.trim()) {
      return false
    }
    
    // 注意：对于Monaco编辑器，文本已经通过ghost text机制插入到model中了
    // 所以这里不应该再次调用applyEdit，否则会导致重复插入
    // 只有在非ghost text模式（如果有的话）才需要调用applyEdit
    
    const logger = createRendererLogger('AICompletionService', {
      windowTypeProvider: () => getWindowType()
    })
    
    // 用户接受补全，切换回主动状态
    if (this.completionMode === 'passive') {
      this.completionMode = 'active'
      logger.info('[主动/被动模式] 用户接受补全（Tab），从被动切换到主动状态')
    }
    
    // 清理状态
    this.cancelCurrentCompletion()
    
    return true
  }
  
  /**
   * 拒绝补全
   */
  rejectCompletion() {
    this.cancelCurrentCompletion()
  }
  
  /**
   * 处理鼠标点击事件（切换光标位置）
   * 立即取消当前补全，并切换到被动状态
   */
  handleMouseClick() {
    const logger = createRendererLogger('AICompletionService', {
      windowTypeProvider: () => getWindowType()
    })
    
    // 取消当前补全
    this.cancelCurrentCompletion()
    
    // 切换到被动状态（用户点击说明在主动操作，应该进入被动模式）
    if (this.completionMode === 'active') {
      this.completionMode = 'passive'
      logger.info('[主动/被动模式] 用户鼠标点击切换光标，从主动切换到被动状态')
    }
  }
}

// 单例服务
export const aiCompletionService = new AICompletionService()

