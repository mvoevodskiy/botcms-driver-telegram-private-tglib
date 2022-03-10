const { Client } = require('tdl')
const { TDLib } = require('tdl-tdlib-addon')
const mt = require('mvtools')

// /** @typedef {Object<import('botcms').Message>} Message */
/** @typedef {import('botcms').MessageElements} MessageElement */

/** @typedef {import('botcms').Keyboard.KeyboardButton} KeyboardButton */
/** @typedef {KeyboardButton[]} KeyboardButtonsRow */

/** @typedef {import('botcms').Keyboard.KeyboardObject} Keyboard */

/** TelegramPrivate driver
 * @class
 *
 * @property {Object} defaults
 * @property {string} driverName
 * @property {string} name
 *
 * @property {Object<import('botcms')>} BC
 * @property {Object<import('mvtools')>} BC.MT
 * @property {Client} Transport
 */

class TelegramPrivate {
  constructor (BC, params = {}) {
    this.BC = BC
    this.MT = this.BC.MT
    this.defaults = {
      name: 'tgpvt',
      driverName: 'tgpvt',
      humanName: 'TelegramPrivate',
      apiId: '1231858',
      apiHash: '43cfa584b32fbccb43cc89e636c3dc75',
      testMode: false,
      command: 'libtdjson',
      databaseDirectory: 'db',
      filesDirectory: 'files',
      logVerbosityLevel: 2,

      phone: '',
      code: '',
      password: '',
      sessionStart: true,
      readProcessed: true,
      alwaysOnline: false,
      useFileDatabase: true,
      useChatInfoDatabase: true,
      useMessageDatabase: true,
      joinLinkBegins: ['https://t.me/joinchat/', 'https://telegram.me/joinchat/', 'https://telegram.dog/joinchat/', 'https://t.me/+', 'https://telegram.me/+', 'https://telegram.dog/+'],
      linkBegins: ['t.me/', 'https://t.me/', '@']
      // sessionHandler: SessionManager,
    }
    this.config = this.BC.MT.mergeRecursive(this.defaults, params)
    this.name = this.config.name
    this.driverName = this.config.driverName
    this.humanName = this.config.humanName
    this.user = {
      id: 0,
      name: '',
      username: ''
    }
    this.pendingIds = {}
    // console.log('TG PVT. TDLIB. CONFIG:', this.config)

    this.Transport = new Client(new TDLib(this.config.command), {
      apiId: this.config.apiId, // specify your API ID
      apiHash: this.config.apiHash, // specify your API Hash
      databaseDirectory: this.config.databaseDirectory, // specify your database directory
      filesDirectory: this.config.filesDirectory // specify your database directory
      // verbosityLevel: 2, // specify TDLib verbosity level to control logging, default 2
      // tdlibParameters: {}, // specify custom tdlibParameters object

      // Node only options
      // appDir: this.config.databaseDirectory, // specify where to place tglib files, default "__tglib__" folder
      // binaryPath: this.config.command // specify the TDLib static binary path, default "libtdjson" in cwd
    })

    // console.log('TG PVT. TDLIB. TRANSPORT:', this.Transport)

    this.waitServerId = async (oldId) => {
      if (this.pendingIds[oldId] !== undefined) {
        const newId = this.pendingIds[oldId]
        delete this.pendingIds[oldId]
        return newId
      } else {
        await this.MT.sleep(5)
        return this.waitServerId(oldId)
      }
    }

    this.waitUser = async (n = 0) => {
      // return this.user
      if (n > 0 && n % 500 === 0) console.debug('TGPVT', this.name, 'WAITING USER (getMe). CURRENT ID:', this.user.id, 'N:', n)
      if (this.user.id !== 0) {
        return this.user
      } else {
        await this.MT.sleep(5)
        n++
        return this.waitUser(n)
      }
    }
  }

  /* @deprecated */
  get tgUser () {
    return this.user
  }

  /* @deprecated */
  set tgUser (user) {
    this.user = user
  }

  isAvailable () {
    return typeof this.Transport === 'object'
  }

  async messageCallback (update) {
    const ctx = { update }
    // console.dir(ctx.update, { depth: 5 })
    try {
      const ctxConfig = {
        useSession: this.config.sessionStart
      }
      /** @type {Object.<import('botcms').Context>} **/
      const bcContext = new this.BC.config.classes.Context(this.BC, this, ctx.update, ctxConfig)

      const EVENTS = bcContext.Message.EVENTS
      let event = ''
      const edited = false
      const isBot = false
      let chatType = 'user'
      let messageText = ''

      let chatId = 0
      let senderId = 0
      let messageId = 0
      let messageIds = []
      let messageDate = 0
      let replyId = 0

      let message = {}
      let fwSenderId
      let attachment
      let entities = []
      const sizes = {}

      switch (ctx.update._) {
        case 'updateNewMessage':
          // case 'updateMessageContent':
          // case 'updateChatLastMessage':
          if ('old_message_id' in ctx.update) {
            this.pendingIds[ctx.update.old_message_id] = ctx.update.message.id
          }
          await this.waitUser()
          message = update.message
          // for (const type of ['message', 'messageContent', 'lastMessage']) {
          //   if (type === ctx.update._) {
          //     message = update[type] || update.message
          //     break
          //   }
          // }
          console.log('MESSAGE:', message)
          if ('reply_markup' in message) console.log('REPLY MARKUP:', message.reply_markup.rows)
          // console.log('MESSAGE CALLBACK. ID: ', message.id)
          messageId = message.id
          messageText = this.MT.extract('content.text.text', message, '')
          messageDate = message.date
          senderId = message.sender.user_id === this.user.id
            ? this.BC.SELF_SEND
            : (message.sender._ === 'messageSenderUser' ? message.sender.user_id : 0)
          chatId = message.chat_id
          if (parseInt(chatId) < 0) {
            chatType = message.isChannelPost ? 'channel' : 'chat'
          }
          if (message.reply_to_message_id) {
            replyId = message.reply_to_message_id
          }
          fwSenderId = this.BC.MT.extract('forward_info.origin.sender_user_id', message, 0)
          if (fwSenderId) {
            bcContext.Message.handleForwarded({
              sender: {
                id: fwSenderId
              },
              date: this.BC.MT.extract('forward_info.date', message, 0)
            })
            bcContext.Message.author.id = fwSenderId
          }

          /**
           * ENTITIES, TEXT
           */
          switch (message.content._) {
            case 'messageText':
              entities = message.content.text.entities
              break

            case 'messagePhoto':
            case 'messageAnimation':
            case 'messageAudio':
            case 'messageDocument':
            case 'messageVideo':
            case 'messageVoiceNote':
              entities = message.content.caption.entities
              messageText = message.content.caption.text
              break
          }

          switch (message.content._) {
            case 'messagePhoto':
              // console.dir(message.content.photo, {depth: 5});
              messageText = this.MT.extract('content.caption.text', message, '')
              for (const size of message.content.photo.sizes) {
                sizes[size.type] = size
              }
              for (const type of ['w', 'y', 'x', 'm', 's', 'd', 'c', 'b', 'a']) {
                if (type in sizes) {
                  attachment = {
                    type: this.BC.ATTACHMENTS.PHOTO,
                    id: sizes[type].photo.remote.unique_id,
                    width: sizes[type].width,
                    height: sizes[type].height,
                    fileSize: sizes[type].photo.size
                  }
                  break
                }
              }
              bcContext.Message.handleAttachment(attachment)
          }
          // console.log(bcContext.Message.forwarded);
          // console.log(bcContext.Message.attachments.photo);

          break

        case 'updateDeleteMessages':
          if (ctx.update.from_cache) {
            return
          }
          // for (const type of ['updateDeleteMessages']) {
          //   if (type === ctx.update._) {
          //     message = ctx.update[type]
          //     break
          //   }
          // }
          // console.log(ctx.update, message)
          // console.log(upd);
          // console.log('MESSAGE CALLBACK. ID: ', message.id);
          messageId = ctx.update.message_ids[0]
          messageIds = ctx.update.message_ids
          messageText = ''
          messageDate = Math.round(Date.now() / 1000)
          senderId = ctx.update.sender?.user_id || 0
          chatId = ctx.update.chat_id
          event = EVENTS.MESSAGE_REMOVE
          if (parseInt(chatId) < 0) {
            chatType = update.is_channel_post ? 'channel' : 'chat'
            event = EVENTS.CHAT_MESSAGE_REMOVE
          }
      }

      if (event === '' && messageText !== '') {
        event = chatId < 0 ? EVENTS.CHAT_MESSAGE_NEW : EVENTS.MESSAGE_NEW
      }

      if (event !== '') {
        bcContext.Message.chat = {
          id: chatId,
          type: chatType
        }
        bcContext.Message.sender = {
          id: senderId,
          isBot
        }
        bcContext.Message.id = messageId
        bcContext.Message.ids = messageIds
        bcContext.Message.date = messageDate
        bcContext.Message.text = messageText
        bcContext.Message.edited = edited
        bcContext.Message.event = event
        bcContext.Message.reply.id = replyId
        if (entities.length) {
          this.fillMessageElements(entities, bcContext.Message)
          // console.log('MESSAGE ELEMENTS: ', bcContext.Message.getElements())
        }
        if ('reply_markup' in message) {
          this.fillMessageKeyboard(message.reply_markup, bcContext.Message)
        }
        bcContext.Message.personal = chatType === 'user' || bcContext.Message.elements.containsPersonal(String(this.user.id), this.user.username)
        // console.log('MESSAGE IS PERSONAL? ', bcContext.Message.personal)
        // console.log('MESSAGE CALLBACK. MSG EVENT ', event, ' ID ', messageId);
        const result = bcContext.process().catch(e => { console.error('[TGPVT ' + this.name + '] ERROR IN CTX PROCESS:', e) })
        if (this.config.readProcessed && chatId && messageId) {
          setImmediate(
            () => this.Transport.invoke({
              _: 'viewMessages',
              chat_id: chatId,
              message_ids: [messageId],
              force_read: true
            })
          )
        }
        return result
      }
    } catch (e) {
      console.error('[TGPVT ' + this.name + '] ERROR WHILE PREPARE OR PROCESSING UPDATE:', e)
      return null
    }
  }

  /**
   *
   * @param {Object[]} entities
   * @param {Message} bcMessage
   * @return {MessageElement[]}
   */
  fillMessageElements (entities, bcMessage) {
    // console.log('TGPVT. MESSAGE RAW ENTITIES', entities)
    const TYPES = this.BC.TYPES.MESSAGE_ELEMENTS
    /** @type {MessageElement[]} */
    const elements = []
    for (const entity of entities) {
      const element = {
        offset: entity.offset,
        length: entity.length
      }
      switch (entity.type._) {
        case 'textEntityTypeMention':
          element.type = TYPES.MENTION_USERNAME
          break
        case 'textEntityTypeMentionName':
          element.type = TYPES.MENTION_ID
          element.id = String(entity.type.user_id)
          break
        case 'textEntityTypeHashtag':
          element.type = TYPES.HASHTAG
          break
        case 'textEntityTypeCashtag':
          element.type = TYPES.CASHTAG
          break
        case 'textEntityTypeBotCommand':
          element.type = TYPES.COMMAND
          break
        case 'textEntityTypeUrl':
          element.type = TYPES.URL
          break
        case 'textEntityTypeEmailAddress':
          element.type = TYPES.EMAIL
          break
        case 'textEntityTypePhoneNumber':
          element.type = TYPES.PHONE
          break
        case 'textEntityTypeBankCardNumber':
          element.type = TYPES.BANK_CARD
          break
        case 'textEntityTypeBold':
          element.type = TYPES.BOLD
          break
        case 'textEntityTypeItalic':
          element.type = TYPES.ITALIC
          break
        case 'textEntityTypeUnderline':
          element.type = TYPES.UNDERLINE
          break
        case 'textEntityTypeStrikethrough':
          element.type = TYPES.STRIKE
          break
        case 'textEntityTypeCode':
        case 'textEntityTypePre':
          element.type = TYPES.CODE
          break
        case 'textEntityTypePreCode':
          element.type = TYPES.CODE
          element.language = entity.type.language
          break
        case 'textEntityTypeTextUrl':
          element.type = TYPES.URL
          element.url = entity.type.url
          break
      }
      elements.push(element)
    }
    bcMessage.addElements(elements, bcMessage.text)
    return elements
  }

  fillMessageKeyboard (replyMarkup, Message) {
    let kbObject = { buttons: [], options: [] }
    switch (replyMarkup._) {
      case 'replyMarkupRemoveKeyboard':
        kbObject = { clear: true }
        break

      case 'replyMarkupShowKeyboard':
      case 'replyMarkupInlineKeyboard':
        if (replyMarkup._ === 'replyMarkupInlineKeyboard') kbObject.inline = true
        if (replyMarkup.resize_keyboard) kbObject.options.push('resize')
        if (replyMarkup.one_time) kbObject.options.push('oneTime')
        for (const rawRow of replyMarkup.rows) {
          const row = []
          for (const rawButton of rawRow) {
            /** @type {KeyboardButton} */
            const button = { text: rawButton.text, data: {}, query: {} }
            console.log('RAW BUTTON:', rawButton)
            switch (rawButton.type._) {
              case 'keyboardButtonTypeRequestPhoneNumber':
                button.data.requestPhone = true
                break
              case 'keyboardButtonTypeRequestLocation':
                button.data.requestLocation = true
                break
              case 'KeyboardButtonTypeRequestPoll':
                button.data.requestPoll = true
                break
              case 'inlineKeyboardButtonTypeUrl':
                button.url = rawButton.type.url
                break
              case 'inlineKeyboardButtonTypeLoginUrl':
                button.data.id = rawButton.type.id
                button.url = rawButton.type.url
                button.data.forwardText = rawButton.type.forward_text
                break
              case 'inlineKeyboardButtonTypeCallback':
                button.data.data = rawButton.type.data
                break
              case 'inlineKeyboardButtonTypeCallbackGame':
                break
              case 'inlineKeyboardButtonTypeSwitchInline':
                button.data.query = rawButton.type.query
                button.data.inCurrentChat = rawButton.type.in_current_chat
                break
              case 'inlineKeyboardButtonTypeBuy':
                button.data.buy = true
                break
            }
            row.push(button)
          }
          kbObject.buttons.push(row)
        }
    }
    // console.log('FILL MESSAGE KB. KB OBJECT')
    // console.dir(kbObject, { depth: 6 })
    Message.keyboard.fromKBObject(kbObject)
  }

  listen () {
    this.Transport.on('update', async (update) => {
      // console.log('[update]')
      // console.dir(update, { depth: 5 })

      // if ('update' in update) {
      // console.log('TG PVT HANDLE UPDATE. CONSTRUCTOR ', ctx.update._, ' MSG ID ', this.MT.extract('update.message.id', ctx));
      // console.log(`[all updates][${ctx._}]`, JSON.stringify(ctx.update));
      let oldId = 0
      if (update._ === 'updateMessageSendSucceeded') {
        // console.log('UPDATE MESSAGE SEND SUCCEEDED', ctx.update)
        update._ = 'updateNewMessage'
        oldId = update.oldMessageId
      }
      if (update._ === 'updateMessageSendFailed') {
        oldId = update.oldMessageId
      } else {
        const state = this.MT.extract('message.sendingState', update, null)
        // console.log('SENDING STATE', state, )
        if (!state) {
          await this.messageCallback(update)
        }
      }
      if (oldId) {
        this.pendingIds[oldId] = update.message.id
      }
      // }
    })
    this.Transport.on('error', async (error) => {
      console.log('[error]', error)
    })
  }

  kbBuild (keyboard, recursive = false) {
    return []
  }

  kbRemove (ctx) {
    console.log('[TGPVT] KB REMOVE')
    return []
  }

  reply (ctx, Parcel) {
    return this.send(Parcel)
  }

  async send (parcel) {
    // console.log('TG PVT SEND MESSAGE. IN DATA ', parcel);

    let text = {
      _: 'formattedText',
      text: parcel.message
    }
    if (typeof parcel.message === 'object') {
      let parseMode = { _: 'textParseModeHTML' }
      if (parcel.message.markup === 'md') {
        parseMode = { _: 'textParseModeMarkdown', version: 2 }
      }
      const response = await this.Transport.invoke({
        _: 'parseTextEntities',
        text: parcel.message.text,
        parse_mode: parseMode
      })
      if (response._ === 'formattedText') {
        text = response
      } else {
        console.error('TG PVT. ERROR PARSE FORMATTED TEXT:', response.message)
        // console.error('TG PVT. PARSE REQUEST TEXT', request.params.text)
      }
    }

    const ids = []
    let content = { _: 'inputMessageText', text }

    if (parcel.fwChatId !== '' && parcel.fwChatId !== 0 && parcel.fwChatId !== null) {
      content = {
        _: 'inputMessageForwarded',
        from_chat_id: parseInt(parcel.fwChatId),
        message_id: parseInt(parcel.fwMsgIds[0]),
        send_copy: false
      }
    }
    const params = {
      chat_id: parcel.peerId,
      reply_to_message_id: parcel.replyMsgId,
      input_message_content: content
    }

    let method = 'sendMessage'
    let waitId = true
    if (parcel.editMsgId !== 0 && parcel.editMsgId !== undefined) {
      waitId = false
      await this.Transport.invoke({
        _: 'getMessage',
        message_id: parseInt(parcel.editMsgId),
        chat_id: parcel.peerId
      })
      // console.log('GET MESSAGE RESPONSE')
      // console.dir(getMsgresponse.messages, {depth: 5})
      method = 'editMessageText'
      params.message_id = parcel.editMsgId
    }

    console.log('TG PVT. SEND PARAMS', params)

    params._ = method
    let response = await this.Transport.invoke(params).catch((e) => {
      console.error('ERROR IN TG PVT', this.name, 'WHILE', method, ':', e)
      return e
    })
    console.log('TG PVT. SEND. FIRST SEND. RESPONSE: ', response)
    if (response._ !== 'error') {
      let id = response.id
      if (waitId) {
        id = await this.waitServerId(id)
      }
      ids.push(id)
    } else if ((response.code === 5 || (response.code === 400 && response.message === 'Chat not found')) && parseInt(parcel.peerId) > 0) {
      response = await this.Transport.invoke({ _: 'createPrivateChat', user_id: parcel.peerId })
      console.log('TG PVT. CREATE PRIVATE CHAT RESPONSE', response)
      if (response._ !== 'error') {
        await this.BC.MT.sleep(500)
        return await this.send(parcel)
      } else {
        console.error('TG PVT. SEND ERROR. CREATE PRIVATE CHAT RESPONSE:')
        console.dir(response, { depth: 5 })
      }
    } else {
      console.error('TG PVT. SEND ERROR. FIRST SEND MESSAGE RESPONSE:')
      console.dir(response, { depth: 5 })
    }
    // console.log('TG PVT SENT MESSAGES: ');
    // console.dir(response, {depth: 5});

    return ids
  }

  async fetchUserInfo (userId, bcContext = null) {
    console.log('FETCH USER INFO. USER ID ', userId, ' CTX MSG ID ', this.MT.extract('Message.id', bcContext))
    let result = { id: userId }
    await this.waitUser()
    if (userId === this.BC.SELF_SEND || userId === 0 || userId === undefined) {
      result = {
        id: this.user.id,
        username: this.user.username,
        first_name: this.user.first_name,
        last_name: this.user.last_name
      }
    } else {
      await Promise.all([
        (async () => this.Transport.invoke({ _: 'getUser', user_id: userId })
          .then(response => {
            if (response._ === 'user') {
              result.username = response.username
              result.first_name = response.first_name
              result.last_name = response.last_name
            }
          }))()
        // (async () => this.Transport.invoke({ _: 'getUserFullInfo', user_id: userId })
        //   .then(response => {
        //     // console.log(response);
        //     if (response._ === 'userFullInfo') {
        //       result.bio = response.bio
        //     }
        //   }))()
      ])
    }
    // console.log('FETCH USER INFO. FOR USER ID ', userId, ' RESULT:', result)
    return result
  }

  async fetchChatInfo (chatId, bcContext = null) {
    console.log('TG PVT. FETCH CHAT INFO. CHAT ID:', chatId)
    let result = { id: chatId }
    // chatId = parseInt(chatId)
    const response = await this.resolveChat(chatId)
    // console.log('TGPVT. FETCH CHAT INFO. RESPONSE', response)
    if (response._ === 'chat') {
      result = await this.prepareChatInfo(response)
      // console.log('FETCHED CHAT INFO .', result)
    }
    return result
  }

  async resolveChat (chatId) {
    let response
    const intChatId = parseInt(chatId)
    const isId = !isNaN(intChatId) && String(chatId) === String(intChatId)
    console.log('TGPVT. RESOLVE CHAT. INT CHAT ID', intChatId, 'IS ID?', isId)
    if (isId) {
      response = await this.Transport.invoke({
        _: 'getChat',
        chat_id: chatId
      })
        .catch((e) => console.error(e))
    } else {
      let username = String(chatId)
      for (const begin of this.config.linkBegins) username = username.replace(begin, '')
      console.log('TGPVT. RESOLVE CHAT. USERNAME', username)
      response = await this.Transport.invoke({ _: 'searchPublicChat', username }).catch((e) => console.error(e))
    }
    console.log('RESOLVE_CHAT. RESPONSE:', response)
    return response
  }

  async prepareChatInfo (chat) {
    console.log('PREPARE CHAT:', chat)
    const result = {
      id: chat.id,
      title: chat.title
    }
    let chatType = 'user'
    const superGroupId = parseInt(String(chat.id).replace(/^-100/, ''))
    switch (chat.type._) {
      case 'chatTypePrivate':
        chatType = 'user'
        break
      case 'chatTypeBasicGroup':
        chatType = 'chat'
        break
      case 'chatTypeSupergroup':
        chatType = chat.type.isChannel ? 'channel' : 'chat'
        console.log('SUPER GROUP ID:', superGroupId)
        await Promise.all([
          // (async () => this.Transport.invoke({ _: 'getSupergroup', supergroup_id: chat.type.supergroupId })
          (async () => this.Transport.invoke({ _: 'getSupergroup', supergroup_id: superGroupId })
            .then(response => {
              // console.log('SUPER GROUP INFO:', response)
              if (response._ === 'supergroup') {
                result.username = response.username
              }
            })
            .catch(e => console.error('GET SUPER GROUP FOR CHAT ID', superGroupId, 'FAILURE:', e)))(),
          // (async () => this.Transport.invoke({ _: 'getSupergroupFullInfo', supergroup_id: chat.type.supergroupId })
          (async () => this.Transport.invoke({ _: 'getSupergroupFullInfo', supergroup_id: parseInt(superGroupId) })
            .then(response => {
              // console.log('SUPER GROUP FULL INFO: ', response)
              if (response._ === 'supergroupFullInfo') {
                result.description = response.description
              }
            })
            .catch(e => console.error('GET SUPER GROUP FULL INFO FOR CHAT ID', chat.id, 'FAILURE:', e)))()
        ])

        break
      case 'chatTypeSecret':
        chatType = 'user'
        break
    }
    result.type = chatType
    return result
  }

  async launch () {
    // const auth = { phoneNumber: () => this.config.phone }
    // if (!mt.empty(this.config.code)) auth.code = () => this.config.code
    // if (!mt.empty(this.config.password)) auth.password = () => this.config.password
    // await this.Transport.use(new Auth(auth))

    await this.Transport.connect()
    console.log('TG PVT.', this.name, 'LAUNCH. CONNECTED.')
    let loggedIn = true
    await this.Transport.login(() => ({
      getPhoneNumber: async retry => retry
        ? Promise.reject('Invalid phone number')
        : Promise.resolve(this.config.phone),
      getAuthCode: async retry => {
        // console.log('GET AUTH CODE. RETRY?', retry, 'CONFIG CODE: ', typeof this.config.code, ')', this.config.code)
        return retry ? Promise.reject('Invalid auth code') : Promise.resolve(this.config.code)
      },
      getPassword: async (passwordHint, retry) => retry
        ? Promise.reject('Invalid password')
        : Promise.resolve(this.config.password),
      getName: async () =>
        Promise.resolve({ firstName: 'John', lastName: 'Doe' })
    })).catch(e => {
      loggedIn = false
      console.error('TG PVT.', this.name, 'LOGIN FAILED:', e.message, '(', e.description, ')', e)
    })
    console.log('TG PVT. LAUNCH.', this.name, 'LOGGED IN (?)', loggedIn)

    await this.getMe()
    await this.Transport.invoke({ _: 'getChats', chat_list: { _: 'chatListMain' }, limit: 50 })
    if (this.config.alwaysOnline) {
      setTimeout(this.setOnline, 0)
    }
    console.debug('TGPVT ' + this.name + ' STARTED')
  }

  async getMe () {
    const response = await this.Transport.invoke({ _: 'getMe' })
    // console.log('GET ME RESPONSE:', response)
    if (response._ === 'user') {
      this.user = {
        id: response.id,
        username: response.username,
        first_name: response.first_name,
        last_name: response.last_name
      }
      console.log(this.user)
    } else {
      console.error('TG PVT', this.name, '. GET ME ERROR', response)
    }
  }

  async getCallbackQueryAnswer (chatId, messageId, data, password = null, gameShortName = null) {
    const payload = { _: 'callbackQueryPayloadData', data }
    if (password !== null) {
      payload._ = 'callbackQueryPayloadDataWithPassword'
      payload.password = password
    } else if (gameShortName !== null) {
      payload._ = 'callbackQueryPayloadGame'
      payload.gameShortName = gameShortName
    }
    return this.Transport.invoke({ _: 'getCallbackQueryAnswer', chat_id: chatId, message_id: messageId, payload })
  }

  async setOnline () {
    // await this.Transport.api.setOption({
    //   name: 'online',
    //   value: {
    //     _: 'optionValueBoolean',
    //     value: true
    //   }
    // })
    // setTimeout(this.setOnline, 5000)
  }

  async joinChat (chatIdOrLink) {
    let chatId = 0
    let chatInfo = {}
    // console.log('TGPVT. JOIN CHAT. CHAT ID OR LINK', chatIdOrLink)
    if (this.isJoinLink(chatIdOrLink)) {
      // console.log('TGPVT. JOIN CHAT. IS JOIN LINK')
      const response = await this.Transport.invoke({ _: 'joinChatByInviteLink', invite_link: chatIdOrLink })
      // console.log('TGPVT. JOIN CHAT. JOIN BY LINK RESPONSE', response)
      if (response._ === 'chat') chatId = response.id
    } else {
      // console.log('TGPVT. JOIN CHAT. IS NOT JOIN LINK')
      const chat = await this.resolveChat(chatIdOrLink)
      // console.log('TGPVT. JOIN CHAT. CHAT BASE INFO', chat.response)
      if (chat._ === 'chat') {
        const response = await this.Transport.invoke({ _: 'joinChat', chat_id: chat.id })
        // console.log('TGPVT. JOIN CHAT. JOIN RESULT', response)
        if (response._ === 'ok') chatId = chat.id
      }
    }
    // console.log('TGPVT. JOIN CHAT. CHAT ID', chatId)
    if (chatId) chatInfo = await this.fetchChatInfo(chatId)
    // console.log('TGPVT. JOIN CHAT. CHAT INFO', chatInfo)
    return chatInfo
  }

  isJoinLink (joinLink) {
    joinLink = String(joinLink)
    let result = false
    for (const begin of this.config.joinLinkBegins) if (joinLink.startsWith(begin)) result = true
    return result
  }
}

module.exports = Object.assign(TelegramPrivate, { Instagram: TelegramPrivate })
module.exports.default = Object.assign(TelegramPrivate, { Instagram: TelegramPrivate })
