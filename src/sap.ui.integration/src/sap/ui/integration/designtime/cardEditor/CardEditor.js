/*!
 * ${copyright}
 */
sap.ui.define([
	"sap/base/util/deepEqual",
	"sap/base/util/each",
	"sap/base/util/merge",
	"sap/base/util/deepClone",
	"sap/base/util/ObjectPath",
	"sap/ui/integration/designtime/baseEditor/BaseEditor",
	"sap/base/util/restricted/_CancelablePromise",
	"sap/base/util/restricted/_toArray",
	"sap/ui/thirdparty/jquery",
	"./config/index"
], function (
	deepEqual,
	each,
	merge,
	deepClone,
	ObjectPath,
	BaseEditor,
	CancelablePromise,
	_toArray,
	jQuery,
	oDefaultCardConfig
) {
	"use strict";

	/**
	 * @constructor
	 * @private
	 * @experimental
	 */
	var CardEditor = BaseEditor.extend("sap.ui.integration.designtime.cardEditor.CardEditor", {
		metadata: {
			properties: {
				"layout": {
					type: "string",
					defaultValue: "form"
				}
			}
		},
		constructor: function (mParameters) {
			mParameters = mParameters || {};
			BaseEditor.prototype.constructor.apply(this, arguments);
			if (!mParameters["config"]) {
				this.addConfig(oDefaultCardConfig);
			}
		},
		renderer: BaseEditor.getMetadata().getRenderer()
	});

	function addValueToDiff(oDiff, sObjectName, sName, sKey, vValue) {
		if (!oDiff[sObjectName]) {
			oDiff[sObjectName] = {};
		}
		if (!oDiff[sObjectName][sName]) {
			oDiff[sObjectName][sName] = {};
		}
		oDiff[sObjectName][sName][sKey] = vValue;
	}

	function getCardConfigurationDeltaForChange(oJson, oInitialJson) {
		var sNamespace = oJson.hasOwnProperty("sap.card") ? "sap.card" : "sap.widget";
		var oConfiguration = ObjectPath.get([sNamespace, "configuration"], oJson);
		var oInitialConfiguration = ObjectPath.get([sNamespace, "configuration"], oInitialJson);

		if (deepEqual(oConfiguration, oInitialConfiguration)) {
			return undefined;
		}

		var oDiff = {};

		each(oConfiguration, function(sObjectName, oObject) {
			each(oObject, function(sName, oSubObject) {
				if (!oInitialConfiguration[sObjectName][sName]) {
					oDiff[sObjectName] = oDiff[sObjectName] || {};
					oDiff[sObjectName][sName] = oSubObject;
				} else {
					each(oSubObject, function(sKey, oValue) {
						if (oInitialConfiguration[sObjectName][sName][sKey] !== oValue) {
							addValueToDiff(oDiff, sObjectName, sName, sKey, oValue);
						}
					});
				}
			});
		});

		return {
			configuration: oDiff
		};
	}

	CardEditor.prototype.init = function () {
		BaseEditor.prototype.init.apply(this, arguments);
		this.attachJsonChange(function (oEvent) {
			if (!this._oInitialJson) {
				this._oInitialJson = oEvent.getParameter("json");
			}
		}, this);

	};

	CardEditor.prototype.setJson = function (oJson) {
		var sCardId = ObjectPath.get(["sap.app", "id"], oJson);

		if (this._bDesigntimeInit && this._bCardId !== sCardId) {
			if (this._oDesigntimePromise) {
				this._oDesigntimePromise.cancel();
			}
			delete this._bCardId;
			delete this._bDesigntimeInit;
		}

		if (!this._bDesigntimeInit) {
			this._bDesigntimeInit = true;
			this._bCardId = sCardId;
			var sDesigntimePath = sanitizePath(ObjectPath.get(["sap.card", "designtime"], oJson) || "");
			var sBaseUrl = sanitizePath(ObjectPath.get(["baseURL"], oJson) || "");

			if (sBaseUrl && sDesigntimePath) {
				var mPaths = {};
				var sSanitizedBaseUrl = sanitizePath(sBaseUrl);
				mPaths[sCardId] = sSanitizedBaseUrl;
				sap.ui.loader.config({
					paths: mPaths
				});
				var sDesigntimeFolderPath = trimCurrentFolderPrefix(sDesigntimePath);
				var sDesigntimePrefix = sCardId + "/" + sDesigntimeFolderPath;
				var sEditorConfigPath = sDesigntimePrefix + "/editor.config";
				var sDesigntimeMetadataPath = sSanitizedBaseUrl + "/" + sDesigntimeFolderPath + "/metadata.json";

				this._oDesigntimePromise = new CancelablePromise(function (fnResolve) {
					Promise.all([
						new Promise(function (fnResolveEditorConfig) {
							sap.ui.require(
								[sEditorConfigPath],
								fnResolveEditorConfig,
								function () {
									return {}; // if editor.config.js doesn't exist
								}
							);
						}),
						new Promise(function (fnResolveMetadata) {
							jQuery.getJSON(sDesigntimeMetadataPath)
								.done(fnResolveMetadata)
								.fail(function () {
									fnResolveMetadata({});
								});
						})
					]).then(fnResolve);
				});

				this._oDesigntimePromise.then(function (aDesigntimeFiles) {
					// Editor config
					var oConfig = merge({}, aDesigntimeFiles[0]);
					oConfig.i18n = _toArray(oConfig.i18n);
					oConfig.i18n.push(sDesigntimePrefix + "/i18n.properties");
					this._addSpecificConfig(merge({}, oConfig));

					// Metadata
					// TODO: Merge file content with delta changes
					var oDesigntimeMetadata = aDesigntimeFiles[1];

					this._oInitialDesigntimeMetadata = oDesigntimeMetadata;
					this.setDesigntimeMetadata(formatImportedDesigntimeMetadata(oDesigntimeMetadata), true);
				}.bind(this));
			}
		}

		BaseEditor.prototype.setJson.apply(this, arguments);
	};

	function formatImportedDesigntimeMetadata (oFlatMetadata) {
		var oFormattedMetadata = {};
		Object.keys(oFlatMetadata).forEach(function (sPath) {
			ObjectPath.set(sPath.split("/"), { __value: deepClone(oFlatMetadata[sPath]) }, oFormattedMetadata);
		});
		return oFormattedMetadata;
	}

	function sanitizePath(sPath) {
		return sPath.trim().replace(/\/*$/, "");
	}

	function trimCurrentFolderPrefix(sPath) {
		return sPath.replace(/^\.\//, "");
	}

	/**
	 *
	 * @param {Object} oPropertyBag - Property bag
	 * @param {String} oPropertyBag.layer - Layer of the Change
	 * @returns {Promise<object>} Promise with the change definition for the current delta changes
	 */
	CardEditor.prototype.getDeltaChangeDefinition = function(oPropertyBag) {
		return new Promise(function (resolve, reject) {
			sap.ui.require(["sap/ui/fl/Change"], function (Change) {
				var oCurrentJson = this.getJson();
				var mParameters = merge({}, oPropertyBag);
				mParameters.content = getCardConfigurationDeltaForChange(oCurrentJson, this._oInitialJson);

				if (!mParameters.content) {
					reject("No Change");
				}

				mParameters.changeType = oCurrentJson.hasOwnProperty("sap.card") ? "appdescr_card" : "appdescr_widget";
				mParameters.creation = new Date().toISOString();
				mParameters.generator = "CardEditor";
				mParameters.selector = {};
				mParameters.reference = ObjectPath.get(["sap.app", "id"], oCurrentJson);

				var oChangeDefinition = Change.createInitialFileContent(mParameters);
				// by default the function createInitialFileContent sets the creation to ""
				oChangeDefinition.creation = new Date().toISOString();

				this._oInitialJson = oCurrentJson;

				resolve(oChangeDefinition);
			}.bind(this));
		}.bind(this));
	};

	return CardEditor;
});
