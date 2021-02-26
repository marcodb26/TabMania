Classes.NewTabAction = Classes.Base.subclass({

	_newTabButtonViewer: null,

_init: function() {
	// Overriding the parent class' _init(), but calling that original function first
	Classes.Base._init.call(this);

	let btnOptions = {
		btnExtraClasses: [ "tm-plus-icon" ],
	};

	this._newTabButtonViewer = Classes.ButtonViewer.create(btnOptions);
	this._newTabButtonViewer.onButtonClickCb = this._createNewTab.bind(this);
	popupViewer.appendButton(this._newTabButtonViewer);
},

_createNewTab: function(ev) {
	chromeUtils.reuseOrCreateTab();
},

}); // Classes.NewTabAction