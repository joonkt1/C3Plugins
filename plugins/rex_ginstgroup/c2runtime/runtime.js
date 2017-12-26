﻿// ECMAScript 5 strict mode
"use strict";

assert2(cr, "cr namespace not created");
assert2(cr.plugins_, "cr.plugins_ not created");

/////////////////////////////////////
// Plugin class
cr.plugins_.Rex_gInstGroup = function (runtime) {
	this.runtime = runtime;
};

(function () {
	var pluginProto = cr.plugins_.Rex_gInstGroup.prototype;

	/////////////////////////////////////
	// Object type class
	pluginProto.Type = function (plugin) {
		this.plugin = plugin;
		this.runtime = plugin.runtime;
	};

	var typeProto = pluginProto.Type.prototype;

	typeProto.onCreate = function () {};

	/////////////////////////////////////
	// Instance class
	pluginProto.Instance = function (type) {
		this.type = type;
		this.runtime = type.runtime;
	};

	var instanceProto = pluginProto.Instance.prototype;

	var _uids = []; // private global object    
	instanceProto.onCreate = function () {
		this.check_name = "INSTGROUP";
		this.groups = {};
		this.randomGen = null;
		this.randomGenUid = -1; // for loading
		this.mapUID = 0;
		this.cmpUIDA = 0;
		this.cmpUIDB = 0;
		this.mapFnName = "";
		this.sortFnName = "";
		this.mappingResult = 0;
		this.cmpResult = 0;
		this.foreachItem = {};
		this.foreachIndex = {};
		this.privateGroupName = {};

		// Need to know if pinned object gets destroyed
		if (!this.recycled) {
			this.myDestroyCallback = (function (self) {
				return function (inst) {
					self.onInstanceDestroyed(inst);
				};
			})(this);
		}

		this.runtime.addDestroyCallback(this.myDestroyCallback);
	};

	instanceProto.onDestroy = function () {
		this.runtime.removeDestroyCallback(this.myDestroyCallback);
	};

	instanceProto.onInstanceDestroyed = function (inst) {
		// auto remove uid from groups
		var uid = inst.uid;
		var name;
		var groups = this.groups;
		for (name in groups)
			groups[name].RemoveUID(uid);

		this.removePrivateGroup(uid);
	};

	var PGPrefix = "@";
	var PGPostfix = "$";
	var getUIDOfPrivateGroup = function (name) {
		if (name.charAt(0) != PGPrefix)
			return (-1);

		var index = name.indexOf(PGPostfix);
		if (index == (-1))
			return (-1);

		var uid = parseInt(name.substring(1, index));
		return uid;
	};

	instanceProto.appendPrivateGroup = function (name) {
		var uid = getUIDOfPrivateGroup(name);
		if (uid == (-1))
			return;

		var nameList = this.privateGroupName[uid];
		if (nameList == null) {
			nameList = [name];
			this.privateGroupName[uid] = nameList;
		} else
			nameList.push(name);
	};

	instanceProto.removePrivateGroup = function (uid) {
		var nameList = this.privateGroupName[uid];
		if (nameList == null)
			return;

		var listLen = nameList.length;
		var i;
		for (i = 0; i < listLen; i++)
			this.DestroyGroup(nameList[i]);
		delete this.privateGroupName[uid];
	};

	instanceProto.GetGroup = function (name) {
		var group = this.groups[name];
		if (group == null) {
			group = new window.rexObjs.GroupKlass();
			this.groups[name] = group;
			this.appendPrivateGroup(name);
		}
		return group;
	};

	instanceProto.HasGroup = function (name) {
		return this.groups.hasOwnProperty(name);
	};

	instanceProto.DestroyGroup = function (name) {
		if (this.HasGroup(name))
			delete this.groups[name];
	};

	instanceProto.all2string = function () {
		var strings = {};
		var name;
		var groups = this.groups;
		for (name in groups)
			strings[name] = groups[name].ToString();
		return JSON.stringify(strings);
	};


	instanceProto.getGroupAB = function (groupA, groupB, groupResult) {
		if ((groupA != groupResult) && (groupB != groupResult)) {
			this.GetGroup(groupResult).Copy(this.GetGroup(groupA));
			groupA = groupResult;
		} else if (groupResult == groupB) {
			groupB = groupA;
			groupA = groupResult;
		}
		return {
			"a": groupA,
			"b": groupB
		};
	};

	instanceProto.uid2Inst = function (uid, objtype) {
		var inst = this.runtime.getObjectByUID(uid);
		if (inst == null)
			return null;

		if ((objtype == null) || (inst.type == objtype))
			return inst;
		else if (objtype.is_family) {
			var families = inst.type.families;
			var cnt = families.length,
				i;
			for (i = 0; i < cnt; i++) {
				if (objtype == families[i])
					return inst;
			}
		}
		// objtype mismatch
		return null;
	};

	instanceProto.PickUIDs = function (uids, objType) {
		if (!objType)
			return false;

		return window.rexObjs.PickUIDs.call(this, uids, objType);
	};

	instanceProto.callMapFunction = function (fnName, uid) {
		this.mapFnName = fnName;
		this.mappingResult = 0;
		this.mapUID = uid;
		this.runtime.trigger(cr.plugins_.Rex_gInstGroup.prototype.cnds.OnMappingFn, this, fnName);
		return this.mappingResult;
	};

	instanceProto.group2insts = function (name, objtype, isPop) {
		var group = this.GetGroup(name);
		var uidList = group.GetList();
		var i, cnt = uidList.length;
		for (i = 0; i < cnt; i++) {
			_uids.push(uidList[i]);
		}
		var hasInst = this.PickUIDs(_uids, objtype);
		if (isPop == 1) {
			for (i = 0; i < cnt; i++)
				group.RemoveUID(_uids[i]);
		}
		_uids.length = 0;
		return hasInst;
	};

	instanceProto.popInstance = function (name, index, objtype, isPop) {
		var group = this.GetGroup(name);
		var uidList = group.GetList();
		var uid = uidList[index];
		_uids.push(uid);

		// output        
		var hasInst = this.PickUIDs(_uids, objtype);
		if (isPop == 1) {
			group.RemoveUID(uid);
		}
		_uids.length = 0;
		return hasInst;
	};
	instanceProto.popInstanceByMapFn = function (name, objtype, isPop, mapFnName, resultType) {
		var group = this.GetGroup(name);
		var uidList = group.GetList();
		var i, cnt = uidList.length;
		var result = null,
			val;
		var isMax = (resultType === 1);
		var uid = -1,
			isUpdated;
		for (i = 0; i < cnt; i++) {
			val = this.callMapFunction(mapFnName, uidList[i]);
			isUpdated = (result === null) ||
				(!isMax && (result > val)) ||
				(isMax && (result < val));

			if (isUpdated) {
				result = val;
				uid = uidList[i];
			}
		}
		_uids.push(uid);

		// output        
		var hasInst = this.PickUIDs(_uids, objtype);
		if (isPop == 1) {
			group.RemoveUID(uid);
		}
		_uids.length = 0;
		return hasInst;
	};

	instanceProto.saveToJSON = function () {
		var info = {};
		var name;
		var groups = this.groups;
		for (name in groups)
			info[name] = groups[name].GetList();

		var randomGenUid = (this.randomGen != null) ? this.randomGen.uid : (-1);
		return {
			"d": info,
			"randomuid": randomGenUid
		};
	};

	instanceProto.loadFromJSON = function (o) {
		var info = o["d"];
		var name, group;
		for (name in info)
			this.GetGroup(name).SetByUIDList(info[name]);

		this.randomGenUid = o["randomuid"];
	};

	instanceProto.afterLoad = function () {
		if (this.randomGenUid === -1)
			this.randomGen = null;
		else {
			this.randomGen = this.runtime.getObjectByUID(this.randomGenUid);
			assert2(this.randomGen, "Instance group: Failed to find random gen object by UID");
		}
		this.randomGenUid = -1;
	};

	/**BEGIN-PREVIEWONLY**/
	instanceProto.getDebuggerValues = function (propsections) {
		var prop = [];
		var groups = this.groups,
			groupName;
		var uid, uids, inst;
		var types = {},
			typeName, s;
		for (groupName in groups) {
			// clean types
			for (typeName in types) {
				delete types[typeName];
			}
			uids = groups[groupName].GetSet();
			for (uid in uids) {
				inst = this.runtime.getObjectByUID(uid);
				if (inst == null)
					continue;
				typeName = inst.type.name;
				if (typeName in types)
					types[typeName] += 1;
				else
					types[typeName] = 1;
			}
			s = "";
			for (typeName in types)
				s += typeName.toString() + ":" + types[typeName].toString() + "  ";
			prop.push({
				"name": groupName,
				"value": s
			});
		}

		propsections.push({
			"title": this.type.name,
			"properties": prop
		});
	};
	/**END-PREVIEWONLY**/

	//////////////////////////////////////
	// Conditions
	function Cnds() {};
	pluginProto.cnds = new Cnds();

	Cnds.prototype.OnMappingFn = function (name) {
		return (this.mapFnName === name);
	};
	Cnds.prototype.OnSortingFn = function (name) {
		return (this.sortFnName === name);
	};

	Cnds.prototype.ForEachUID = function (var_name, name) {
		var uids = this.GetGroup(name).GetList();
		var uids_len = uids.length;
		var i;
		var current_event = this.runtime.getCurrentEventStack().current_event;
		for (i = 0; i < uids_len; i++) {
			this.foreachItem[var_name] = uids[i];
			this.foreachIndex[var_name] = i;
			this.runtime.pushCopySol(current_event.solModifiers);
			current_event.retrigger();
			this.runtime.popSol(current_event.solModifiers);
		}

		return false;
	};

	Cnds.prototype.Group2Insts = function (name, objtype, isPop) {
		if (!objtype)
			return;
		return this.group2insts(name, objtype, isPop);
	};

	Cnds.prototype.IsInGroup = function (uid, name) {
		return this.GetGroup(name).IsInGroup(uid);
	};

	Cnds.prototype.IsEmpty = function (name) {
		return (this.GetGroup(name).GetList().length == 0);
	};

	Cnds.prototype.PopInst = function (name, index, objtype, isPop) {
		if (!objtype)
			return;
		return this.popInstance(name, index, objtype, isPop);
	};

	Cnds.prototype.IsSubset = function (subset_name, main_name) {
		var main_group = this.GetGroup(main_name);
		var subsetGroup = this.GetGroup(subset_name);
		return main_group.IsSubset(subsetGroup);
	};

	Cnds.prototype.RandomPopInstance = function (name, objtype, isPop) {
		if (!objtype)
			return;
		var index = Math.floor(Math.random() * this.GetGroup(name).GetList().length);
		return this.popInstance(name, index, objtype, isPop);
	};

	Cnds.prototype.PopInstByMappingFunction = function (name, objtype, isPop, mapFnName, resultType) {
		if (!objtype)
			return;
		return this.popInstanceByMapFn(name, objtype, isPop, mapFnName, resultType);
	};
	//////////////////////////////////////
	// Actions
	function Acts() {};
	pluginProto.acts = new Acts();

	Acts.prototype.DestroyAll = function () {
		var name;
		for (name in this.groups)
			delete this.groups[name];
	};

	Acts.prototype.Clean = function (name) {
		this.GetGroup(name).Clean();
	};

	Acts.prototype.DestroyGroup = function (name) {
		this.DestroyGroup(name);
	};

	Acts.prototype.Copy = function (source, target) {
		if (source == target)
			return;
		this.GetGroup(target).Copy(this.GetGroup(source));
	};

	Acts.prototype.String2Group = function (JSONString, name) {
		this.GetGroup(name).JSONString2Group(JSONString);
	};

	Acts.prototype.String2All = function (JSONString) {
		var groups = JSON.parse(JSONString);
		var name;
		for (name in groups)
			this.GetGroup(name).JSONString2Group(groups[name]);
	};

	Acts.prototype.AddInsts = function (objtype, name) {
		if (!objtype)
			return;

		var insts = objtype.getCurrentSol().getObjects();
		var cnt = insts.length;
		if (cnt == 1)
			this.GetGroup(name).AddUID(insts[0].uid);
		else {
			var i, uids = [];
			uids.length = insts.length;
			for (i = 0; i < cnt; i++)
				uids[i] = insts[i].uid;

			this.GetGroup(name).AddUID(uids);
		}
	};

	Acts.prototype.AddInstByUID = function (uid, name) {
		this.GetGroup(name).AddUID(uid);
	};

	Acts.prototype.RemoveInsts = function (objtype, name) {
		if (!objtype)
			return;

		var insts = objtype.getCurrentSol().getObjects();
		var cnt = insts.length;
		if (cnt == 1)
			this.GetGroup(name).RemoveUID(insts[0].uid);
		else {
			var i, uids = [];
			uids.length = insts.length;
			for (i = 0; i < cnt; i++)
				uids[i] = insts[i].uid;

			this.GetGroup(name).RemoveUID(uids);
		}
	};

	Acts.prototype.RemoveInst = function (uid, name) {
		this.GetGroup(name).RemoveUID(uid);
	};

	Acts.prototype.Union = function (groupA, groupB, groupResult) {
		var groups = this.getGroupAB(groupA, groupB, groupResult);
		this.GetGroup(groups["a"]).Union(this.GetGroup(groups["b"]));
	};

	Acts.prototype.Complement = function (groupA, groupB, groupResult) {
		var groups = this.getGroupAB(groupA, groupB, groupResult);
		this.GetGroup(groups["a"]).Complement(this.GetGroup(groups["b"]));
	};

	Acts.prototype.Intersection = function (groupA, groupB, groupResult) {
		var groups = this.getGroupAB(groupA, groupB, groupResult);
		this.GetGroup(groups["a"]).Intersection(this.GetGroup(groups["b"]));
	};

	Acts.prototype.Shuffle = function (name) {
		this.GetGroup(name).Shuffle(this.randomGen);
	};

	Acts.prototype.SortByFn = function (name, fnName) {
		var uidList = this.GetGroup(name).GetList();
		var self = this;
		uidList.sort(function (uidA, uidB) {
			self.cmpUIDA = uidA;
			self.cmpUIDB = uidB;
			self.cmpResult = 0;
			self.runtime.trigger(cr.plugins_.Rex_gInstGroup.prototype.cnds.OnSortingFn, self, fnName);
			return self.cmpResult;
		});
	};

	Acts.prototype.SetCmpResultDirectly = function (result) {
		this.cmpResult = result;
	};

	Acts.prototype.SetCmpResultCombo = function (result) {
		this.cmpResult = result - 1;
	};

	Acts.prototype.Group2Insts = function (name, objtype, isPop) {
		if (!objtype)
			return;

		this.group2insts(name, objtype, isPop);
	};

	Acts.prototype.SortByUID = function (name, method) {
		var uidList = this.GetGroup(name).GetList();
		uidList.sort();
		if (method === 0)
			uidList.reverse();
	};

	// deprecated
	Acts.prototype.SortByUIDDec = function (name) {
		this.GetGroup(name).GetList().sort().reverse();
	};

	Acts.prototype.Reverse = function (name) {
		this.GetGroup(name).GetList().reverse();
	};

	Acts.prototype.Slice = function (source, start, end, target, isPop) {
		var sourceGroup = this.GetGroup(source);
		var targetGroup = this.GetGroup(target);
		var _list = sourceGroup.GetList().slice(start, end);
		targetGroup.SetByUIDList(_list);
		if (isPop == 1)
			sourceGroup.Complement(targetGroup);
	};

	Acts.prototype.PopInst = function (name, index, objtype, isPop) {
		if (!objtype)
			return;
		this.popInstance(name, index, objtype, isPop);
	};

	Acts.prototype.SetRandomGenerator = function (objType) {
		var randomGen = objType.getFirstPicked();
		if (randomGen.check_name == "RANDOM")
			this.randomGen = randomGen;
		else
			alert("[Instance group] This object is not a random generator object.");
	};

	Acts.prototype.PushInsts = function (isFront, objtype, name) {
		if (!objtype)
			return;

		var insts = objtype.getCurrentSol().getObjects();
		var cnt = insts.length;
		if (cnt == 1)
			this.GetGroup(name).PushUID(isFront, insts[0].uid);
		else {
			var i, uids = [];
			uids.length = insts.length;
			for (i = 0; i < cnt; i++)
				uids[i] = insts[i].uid;

			this.GetGroup(name).PushUID(uids, isFront);
		}
	};

	Acts.prototype.PushInstByUID = function (isFront, uid, name) {
		this.GetGroup(name).PushUID(uid, isFront);
	};

	Acts.prototype.InsertInsts = function (objtype, name, index) {
		if (!objtype)
			return;

		var insts = objtype.getCurrentSol().getObjects();
		var cnt = insts.length;
		if (cnt == 1)
			this.GetGroup(name).InsertUID(insts[0].uid, index);
		else {
			var i, uids = [];
			uids.length = insts.length;
			for (i = 0; i < cnt; i++)
				uids[i] = insts[i].uid;

			this.GetGroup(name).InsertUID(uids, index);
		}
	};

	Acts.prototype.InsertInstByUID = function (uid, name, index) {
		this.GetGroup(name).InsertUID(uid, index);
	};

	Acts.prototype.CleanAdddInsts = function (objtype, name) {
		cr.plugins_.Rex_gInstGroup.prototype.acts.Clean.call(this, name);
		cr.plugins_.Rex_gInstGroup.prototype.acts.AddInsts.call(this, objtype, name);
	};

	Acts.prototype.CleanAdddInstByUID = function (uid, name) {
		cr.plugins_.Rex_gInstGroup.prototype.acts.Clean.call(this, name);
		cr.plugins_.Rex_gInstGroup.prototype.acts.AddInstByUID.call(this, uid, name);
	};

	Acts.prototype.RandomPopInstance = function (name, objtype, isPop) {
		if (!objtype)
			return;
		var index = Math.floor(Math.random() * this.GetGroup(name).GetList().length);
		return this.popInstance(name, index, objtype, isPop);
	};

	Acts.prototype.SetMappingResult = function (val) {
		this.mappingResult = val;
	};

	Acts.prototype.PopInstByMappingFunction = function (name, objtype, isPop, mapFnName, resultType) {
		if (!objtype)
			return;
		return this.popInstanceByMapFn(name, objtype, isPop, mapFnName, resultType);
	};

	Acts.prototype.SortByMappingFunction = function (name, fnName, method_) {
		var uidList = this.GetGroup(name).GetList();
		var self = this;
		var uid2result = {};
		uidList.sort(function (uidA, uidB) {
			if (!uid2result.hasOwnProperty(uidA))
				uid2result[uidA] = self.callMapFunction(fnName, uidA);
			if (!uid2result.hasOwnProperty(uidB))
				uid2result[uidB] = self.callMapFunction(fnName, uidB);

			var method = method_;
			var valA = uid2result[uidA];
			var valB = uid2result[uidB];

			if (method >= 2) {
				valA = parseFloat(valA);
				valB = parseFloat(valB);
				method -= 2;
			}

			if (valA === valB)
				return 0;
			else if (valA > valB) {
				if (method === 1)
					return 1;
				else
					return -1;
			} else {
				if (method === 1)
					return -1;
				else
					return 1;
			}
		});
	};

	Acts.prototype.DestroyInstanceInGroup = function (name) {
		if (!this.HasGroup(name))
			return;

		var uids = this.GetGroup(name).GetList();
		var i, cnt = uids.length,
			inst;
		for (i = 0; i < cnt; i++) {
			inst = this.uid2Inst(uids[i]);
			if (inst)
				this.runtime.DestroyInstance(inst);
		}
	};
	//////////////////////////////////////
	// Expressions
	function Exps() {};
	pluginProto.exps = new Exps();

	Exps.prototype.MapUID = function (ret) {
		ret.set_any(this.mapUID);
	};
	Exps.prototype.CmpUIDA = function (ret) {
		ret.set_any(this.cmpUIDA);
	};

	Exps.prototype.CmpUIDB = function (ret) {
		ret.set_any(this.cmpUIDB);
	};

	Exps.prototype.InstCnt = function (ret, name) {
		ret.set_int(this.GetGroup(name).GetList().length);
	};

	Exps.prototype.UID2Index = function (ret, name, uid) {
		ret.set_int(this.GetGroup(name).UID2Index(uid));
	};

	Exps.prototype.Index2UID = function (ret, name, index) {
		ret.set_any(this.GetGroup(name).Index2UID(index));
	};

	Exps.prototype.Item = function (ret, var_name) {
		var item = this.foreachItem[var_name];
		if (item == null)
			item = (-1);
		ret.set_any(item);
	};

	Exps.prototype.Index = function (ret, var_name) {
		var index = this.foreachIndex[var_name];
		if (index == null)
			index = (-1);
		ret.set_int(index);
	};

	Exps.prototype.GroupToString = function (ret, name) {
		ret.set_string(this.GetGroup(name).ToString());
	};

	Exps.prototype.AllToString = function (ret) {
		ret.set_string(this.all2string());
	};

	Exps.prototype.PrivateGroup = function (ret, uid, name) {
		ret.set_string(PGPrefix + uid.toString() + PGPostfix + name);
	};

	Exps.prototype.Pop = function (ret, name, index) {
		ret.set_any(this.GetGroup(name).Pop(index));
	};

	Exps.prototype.FirstUID = function (ret, name) {
		ret.set_any(this.GetGroup(name).Index2UID(0));
	};

	Exps.prototype.LastUID = function (ret, name) {
		var uidList = this.GetGroup(name).GetList();
		var index = uidList.length - 1;
		var uid = uidList[index];
		if (uid == null) {
			uid = -1;
		}
		ret.set_any(uid);
	};

	Exps.prototype.RandomIndex = function (ret, name) {
		var index = Math.floor(Math.random() * this.GetGroup(name).GetList().length);
		ret.set_int(index);
	};

	Exps.prototype.RandomIndex2UID = function (ret, name) {
		var group = this.GetGroup(name);
		var index = Math.floor(Math.random() * group.GetList().length);
		ret.set_any(group.Index2UID(index));
	};

	Exps.prototype.RandomPop = function (ret, name) {
		var index = Math.floor(Math.random() * this.GetGroup(name).GetList().length);
		ret.set_any(this.GetGroup(name).Pop(index));
	};
}());