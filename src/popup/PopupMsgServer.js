// CLASS PopupMsgServer
//
// Current commands list
//
// - "tabsList"
Classes.PopupMsgServer = Classes.MsgServer.subclass({

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.MsgServer._init.apply(this, arguments);
},

}); // CLASS PopupMsgServer
