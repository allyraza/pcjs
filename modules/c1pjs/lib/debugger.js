/**
 * @fileoverview This file implements the C1Pjs Debugger component.
 * @author <a href="mailto:Jeff@pcjs.org">Jeff Parsons</a>
 * @version 1.0
 * Created 2012-Jun-21
 *
 * Copyright © 2012-2015 Jeff Parsons <Jeff@pcjs.org>
 *
 * This file is part of C1Pjs, which is part of the JavaScript Machines Project (aka JSMachines)
 * at <http://jsmachines.net/> and <http://pcjs.org/>.
 *
 * C1Pjs is free software: you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 *
 * C1Pjs is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
 * even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with C1Pjs.  If not,
 * see <http://www.gnu.org/licenses/gpl.html>.
 *
 * You are required to include the above copyright notice in every source code file of every
 * copy or modified version of this work, and to display that copyright notice on every screen
 * that loads or runs any version of this software (see Computer.sCopyright).
 *
 * Some C1Pjs files also attempt to load external resource files, such as character-image files,
 * ROM files, and disk image files. Those external resource files are not considered part of the
 * C1Pjs program for purposes of the GNU General Public License, and the author does not claim
 * any copyright as to their contents.
 */

"use strict";

/**
 * C1PDebugger(parmsDbg)
 *
 * The C1PDebugger component has no required (parmsDbg) properties.
 *
 * The C1PDebugger component is an optional component that implements a variety of user
 * commands for controlling the CPU, dumping and editing memory, etc.
 *
 * @constructor
 * @extends Component
 */
function C1PDebugger(parmsDbg)
{
    if (DEBUGGER) {

        Component.call(this, "C1PDebugger", parmsDbg);

        this.dbg = this;
        /*
         * This keeps track of instruction activity, but only when tracing or when
         * Debugger checks have been enabled (eg, one or more breakpoints have been set).
         *
         * This is zeroed by CPU notification handlers reset() and stopped().
         * We set it here to -1 to indicate that the CPU has not yet initialized us.
         */
        this.cIns = -1;

        /*
         * Some commands, like the dump (d) command, start at nextAddr when no address
         * is given (and they also update nextAddr when they're done).
         */
        this.nextAddr = 0;

        /*
         * When Enter is pressed on an empty input buffer, we default to the previous
         * command, which is preserved here.
         */
        this.prevCmd = null;

        /*
         * fAssemble is true when "assemble mode" is active, false when not.
         */
        this.fAssemble = false;
        this.addrAssembleNext = 0;

        /*
         * Initialize the lists of breakpoint addresses.  aExecBreak is a list (Array) of addresses
         * to halt at whenever attempting to execute an instruction at the corresponding address,
         * and aReadBreak and aWriteBreak are lists of addresses to halt at whenever a read or write,
         * respectively, occurs at the corresponding address.
         */
        this.clearBreakpoints();

        /*
         * Instead of pre-allocating these arrays, we wait until our reset() function is called.
         * These arrays are updated in checkInstruction(), but the CPU will never actually call it
         * unless checksEnabled() returns true, and that won't happen until one or more breakpoints
         * have been set.  This ensures that, by default, the CPU runs as fast as possible.
         */
        this.iStepHistory = 0;
        this.aStepHistory = [];
        this.aaOpcodeFreqs = [];

        /*
         * This "info" buffer is a lightweight logging mechanism that has minimal impact on the
         * browser (unlike printing to either window.console.log or an HTML control, which can make
         * the browser unusable if printing is too frequent).  The Debugger's "i" command dumps
         * this buffer.  Note that dumping too much at once can also bog things down, but by that
         * point, you've presumably already captured the info you need and are willing to wait.
         */
        if (DEBUG) {
            this.iInfoBuffer = 0;
            this.aInfoBuffer = new Array(10000);
        }

        /*
         * Message categories supported by the message() function; they are designed to be combined
         * (ie, OR'ed) as needed.  The Debugger's "option" command is used to turn message categories
         * on and off, like so:
         *
         *      o msg port on
         *      o msg port off
         *      ...
         */
        this.MESSAGE_PORT   = 0x01;
        this.MESSAGE_KBD    = 0x10;
        this.MESSAGE_VIDEO  = 0x20;
        this.MESSAGE_DISK   = 0x40;
        this.MESSAGE_SERIAL = 0x80;
        this.MESSAGE_NONE   = 0x00;
     // this.MESSAGE_ALL    = 0xff;
        this.bitsMessage = this.MESSAGE_NONE;
        this.aMessageCategories = {
            'port':     this.MESSAGE_PORT,
            'kbd':      this.MESSAGE_KBD,
            'video':    this.MESSAGE_VIDEO,
            'disk':     this.MESSAGE_DISK,
            'serial':   this.MESSAGE_SERIAL
        };

        /*
         * The aaOperations array is indexed by opcode, and each element is a sub-array that
         * describes the corresponding opcode. The sub-elements are as follows:
         *
         *      [0]: {number} of the operation code (see OP_*)
         *      [1]: {number} of additional bytes following the opcode byte, if any
         *      [2]: {number} of the operation mode operand, if any (see MODE_*)
         *
         * These sub-elements are all optional. If [0] is not present, the opcode is undefined;
         * if [1] is not present (or contains a zero), the opcode is a single-byte opcode; and if
         * [2] is not present, the opcode uses no (or implied) operands.
         */
        this.OP_ADC = 0;
        this.OP_AND = 1;
        this.OP_ASL = 2;
        this.OP_BCC = 3;
        this.OP_BCS = 4;
        this.OP_BEQ = 5;
        this.OP_BIT = 6;
        this.OP_BMI = 7;
        this.OP_BNE = 8;
        this.OP_BPL = 9;
        this.OP_BRK = 10;
        this.OP_BVC = 11;
        this.OP_BVS = 12;
        this.OP_CLC = 13;
        this.OP_CLD = 14;
        this.OP_CLI = 15;
        this.OP_CLV = 16;
        this.OP_CMP = 17;
        this.OP_CPX = 18;
        this.OP_CPY = 19;
        this.OP_DEC = 20;
        this.OP_DEX = 21;
        this.OP_DEY = 22;
        this.OP_EOR = 23;
        this.OP_INC = 24;
        this.OP_INX = 25;
        this.OP_INY = 26;
        this.OP_JMP = 27;
        this.OP_JSR = 28;
        this.OP_LDA = 29;
        this.OP_LDX = 30;
        this.OP_LDY = 31;
        this.OP_LSR = 32;
        this.OP_NOP = 33;
        this.OP_ORA = 34;
        this.OP_PHA = 35;
        this.OP_PHP = 36;
        this.OP_PLA = 37;
        this.OP_PLP = 38;
        this.OP_ROL = 39;
        this.OP_ROR = 40;
        this.OP_RTI = 41;
        this.OP_RTS = 42;
        this.OP_SBC = 43;
        this.OP_SEC = 44;
        this.OP_SED = 45;
        this.OP_SEI = 46;
        this.OP_STA = 47;
        this.OP_STX = 48;
        this.OP_STY = 49;
        this.OP_TAX = 50;
        this.OP_TAY = 51;
        this.OP_TSX = 52;
        this.OP_TXA = 53;
        this.OP_TXS = 54;
        this.OP_TYA = 55;
        this.OP_SIM = 56;
        this.OP_DB  = 57;

        this.aOpCodes = [
            "ADC","AND","ASL","BCC","BCS","BEQ","BIT","BMI",
            "BNE","BPL","BRK","BVC","BVS","CLC","CLD","CLI",
            "CLV","CMP","CPX","CPY","DEC","DEX","DEY","EOR",
            "INC","INX","INY","JMP","JSR","LDA","LDX","LDY",
            "LSR","NOP","ORA","PHA","PHP","PLA","PLP","ROL",
            "ROR","RTI","RTS","SBC","SEC","SED","SEI","STA",
            "STX","STY","TAX","TAY","TSX","TXA","TXS","TYA",
            "SIM",".DB"
        ];

        this.aOpSimCodes = [
            "HLT", "MSG"
        ];

        this.setOpModes(true);

        this.aaOperations = [
            /* 0x00 */ [this.OP_BRK],
            /* 0x01 */ [this.OP_ORA, 1, this.MODE_INDX],
            /* 0x02 */ [this.OP_SIM, 1],
            /* 0x03 */ [],
            /* 0x04 */ [],
            /* 0x05 */ [this.OP_ORA, 1, this.MODE_ZP],
            /* 0x06 */ [this.OP_ASL, 1, this.MODE_ZP],
            /* 0x07 */ [],
            /* 0x08 */ [this.OP_PHP],
            /* 0x09 */ [this.OP_ORA, 1, this.MODE_IMM],
            /* 0x0a */ [this.OP_ASL, 0, this.MODE_ACC],
            /* 0x0b */ [],
            /* 0x0c */ [],
            /* 0x0d */ [this.OP_ORA, 2, this.MODE_ABS],
            /* 0x0e */ [this.OP_ASL, 2, this.MODE_ABS],
            /* 0x0f */ [],
            /* 0x10 */ [this.OP_BPL, 1, this.MODE_DISP],
            /* 0x11 */ [this.OP_ORA, 1, this.MODE_INDY],
            /* 0x12 */ [],
            /* 0x13 */ [],
            /* 0x14 */ [],
            /* 0x15 */ [this.OP_ORA, 1, this.MODE_ZPX],
            /* 0x16 */ [this.OP_ASL, 1, this.MODE_ZPX],
            /* 0x17 */ [],
            /* 0x18 */ [this.OP_CLC],
            /* 0x19 */ [this.OP_ORA, 2, this.MODE_ABSY],
            /* 0x1a */ [],
            /* 0x1b */ [],
            /* 0x1c */ [],
            /* 0x1d */ [this.OP_ORA, 2, this.MODE_ABSX],
            /* 0x1e */ [this.OP_ASL, 2, this.MODE_ABSX],
            /* 0x1f */ [],
            /* 0x20 */ [this.OP_JSR, 2, this.MODE_IMM16],
            /* 0x21 */ [this.OP_AND, 1, this.MODE_INDX],
            /* 0x22 */ [],
            /* 0x23 */ [],
            /* 0x24 */ [this.OP_BIT, 1, this.MODE_ZP],
            /* 0x25 */ [this.OP_AND, 1, this.MODE_ZP],
            /* 0x26 */ [this.OP_ROL, 1, this.MODE_ZP],
            /* 0x27 */ [],
            /* 0x28 */ [this.OP_PLP],
            /* 0x29 */ [this.OP_AND, 1, this.MODE_IMM],
            /* 0x2a */ [this.OP_ROL, 0, this.MODE_ACC],
            /* 0x2b */ [],
            /* 0x2c */ [this.OP_BIT, 2, this.MODE_ABS],
            /* 0x2d */ [this.OP_AND, 2, this.MODE_ABS],
            /* 0x2e */ [this.OP_ROL, 2, this.MODE_ABS],
            /* 0x2f */ [],
            /* 0x30 */ [this.OP_BMI, 1, this.MODE_DISP],
            /* 0x31 */ [this.OP_AND, 1, this.MODE_INDY],
            /* 0x32 */ [],
            /* 0x33 */ [],
            /* 0x34 */ [],
            /* 0x35 */ [this.OP_AND, 1, this.MODE_ZPX],
            /* 0x36 */ [this.OP_ROL, 1, this.MODE_ZPX],
            /* 0x37 */ [],
            /* 0x38 */ [this.OP_SEC],
            /* 0x39 */ [this.OP_AND, 2, this.MODE_ABSY],
            /* 0x3a */ [],
            /* 0x3b */ [],
            /* 0x3c */ [],
            /* 0x3d */ [this.OP_AND, 2, this.MODE_ABSX],
            /* 0x3e */ [this.OP_ROL, 2, this.MODE_ABSX],
            /* 0x3f */ [],
            /* 0x40 */ [this.OP_RTI],
            /* 0x41 */ [this.OP_EOR, 1, this.MODE_INDX],
            /* 0x42 */ [],
            /* 0x43 */ [],
            /* 0x44 */ [],
            /* 0x45 */ [this.OP_EOR, 1, this.MODE_ZP],
            /* 0x46 */ [this.OP_LSR, 1, this.MODE_ZP],
            /* 0x47 */ [],
            /* 0x48 */ [this.OP_PHA],
            /* 0x49 */ [this.OP_EOR, 1, this.MODE_IMM],
            /* 0x4a */ [this.OP_LSR, 0, this.MODE_ACC],
            /* 0x4b */ [],
            /* 0x4c */ [this.OP_JMP, 2, this.MODE_IMM16],
            /* 0x4d */ [this.OP_EOR, 2, this.MODE_ABS],
            /* 0x4e */ [this.OP_LSR, 2, this.MODE_ABS],
            /* 0x4f */ [],
            /* 0x50 */ [this.OP_BVC, 1, this.MODE_DISP],
            /* 0x51 */ [this.OP_EOR, 1, this.MODE_INDY],
            /* 0x52 */ [],
            /* 0x53 */ [],
            /* 0x54 */ [],
            /* 0x55 */ [this.OP_EOR, 1, this.MODE_ZPX],
            /* 0x56 */ [this.OP_LSR, 1, this.MODE_ZPX],
            /* 0x57 */ [],
            /* 0x58 */ [this.OP_CLI],
            /* 0x59 */ [this.OP_EOR, 2, this.MODE_ABSY],
            /* 0x5a */ [],
            /* 0x5b */ [],
            /* 0x5c */ [],
            /* 0x5d */ [this.OP_EOR, 2, this.MODE_ABSX],
            /* 0x5e */ [this.OP_LSR, 2, this.MODE_ABSX],
            /* 0x5f */ [],
            /* 0x60 */ [this.OP_RTS],
            /* 0x61 */ [this.OP_ADC, 1, this.MODE_INDX],
            /* 0x62 */ [],
            /* 0x63 */ [],
            /* 0x64 */ [],
            /* 0x65 */ [this.OP_ADC, 1, this.MODE_ZP],
            /* 0x66 */ [this.OP_ROR, 1, this.MODE_ZP],
            /* 0x67 */ [],
            /* 0x68 */ [this.OP_PLA],
            /* 0x69 */ [this.OP_ADC, 1, this.MODE_IMM],
            /* 0x6a */ [this.OP_ROR, 0, this.MODE_ACC],
            /* 0x6b */ [],
            /* 0x6c */ [this.OP_JMP, 2, this.MODE_ABS16],
            /* 0x6d */ [this.OP_ADC, 2, this.MODE_ABS],
            /* 0x6e */ [this.OP_ROR, 2, this.MODE_ABS],
            /* 0x6f */ [],
            /* 0x70 */ [this.OP_BVS, 1, this.MODE_DISP],
            /* 0x71 */ [this.OP_ADC, 1, this.MODE_INDY],
            /* 0x72 */ [],
            /* 0x73 */ [],
            /* 0x74 */ [],
            /* 0x75 */ [this.OP_ADC, 1, this.MODE_ZPX],
            /* 0x76 */ [this.OP_ROR, 1, this.MODE_ZPX],
            /* 0x77 */ [],
            /* 0x78 */ [this.OP_SEI],
            /* 0x79 */ [this.OP_ADC, 2, this.MODE_ABSY],
            /* 0x7a */ [],
            /* 0x7b */ [],
            /* 0x7c */ [],
            /* 0x7d */ [this.OP_ADC, 2, this.MODE_ABSX],
            /* 0x7e */ [this.OP_ROR, 2, this.MODE_ABSX],
            /* 0x7f */ [],
            /* 0x80 */ [],
            /* 0x81 */ [this.OP_STA, 1, this.MODE_INDX],
            /* 0x82 */ [],
            /* 0x83 */ [],
            /* 0x84 */ [this.OP_STY, 1, this.MODE_ZP],
            /* 0x85 */ [this.OP_STA, 1, this.MODE_ZP],
            /* 0x86 */ [this.OP_STX, 1, this.MODE_ZP],
            /* 0x87 */ [],
            /* 0x88 */ [this.OP_DEY],
            /* 0x89 */ [],
            /* 0x8a */ [this.OP_TXA],
            /* 0x8b */ [],
            /* 0x8c */ [this.OP_STY, 2, this.MODE_ABS],
            /* 0x8d */ [this.OP_STA, 2, this.MODE_ABS],
            /* 0x8e */ [this.OP_STX, 2, this.MODE_ABS],
            /* 0x8f */ [],
            /* 0x90 */ [this.OP_BCC, 1, this.MODE_DISP],
            /* 0x91 */ [this.OP_STA, 1, this.MODE_INDY],
            /* 0x92 */ [],
            /* 0x93 */ [],
            /* 0x94 */ [this.OP_STY, 1, this.MODE_ZPX],
            /* 0x95 */ [this.OP_STA, 1, this.MODE_ZPX],
            /* 0x96 */ [this.OP_STX, 1, this.MODE_ZPY],
            /* 0x97 */ [],
            /* 0x98 */ [this.OP_TYA],
            /* 0x99 */ [this.OP_STA, 2, this.MODE_ABSY],
            /* 0x9a */ [this.OP_TXS],
            /* 0x9b */ [],
            /* 0x9c */ [],
            /* 0x9d */ [this.OP_STA, 2, this.MODE_ABSX],
            /* 0x9e */ [],
            /* 0x9f */ [],
            /* 0xa0 */ [this.OP_LDY, 1, this.MODE_IMM],
            /* 0xa1 */ [this.OP_LDA, 1, this.MODE_INDX],
            /* 0xa2 */ [this.OP_LDX, 1, this.MODE_IMM],
            /* 0xa3 */ [],
            /* 0xa4 */ [this.OP_LDY, 1, this.MODE_ZP],
            /* 0xa5 */ [this.OP_LDA, 1, this.MODE_ZP],
            /* 0xa6 */ [this.OP_LDX, 1, this.MODE_ZP],
            /* 0xa7 */ [],
            /* 0xa8 */ [this.OP_TAY],
            /* 0xa9 */ [this.OP_LDA, 1, this.MODE_IMM],
            /* 0xaa */ [this.OP_TAX],
            /* 0xab */ [],
            /* 0xac */ [this.OP_LDY, 2, this.MODE_ABS],
            /* 0xad */ [this.OP_LDA, 2, this.MODE_ABS],
            /* 0xae */ [this.OP_LDX, 2, this.MODE_ABS],
            /* 0xaf */ [],
            /* 0xb0 */ [this.OP_BCS, 1, this.MODE_DISP],
            /* 0xb1 */ [this.OP_LDA, 1, this.MODE_INDY],
            /* 0xb2 */ [],
            /* 0xb3 */ [],
            /* 0xb4 */ [this.OP_LDY, 1, this.MODE_ZPX],
            /* 0xb5 */ [this.OP_LDA, 1, this.MODE_ZPX],
            /* 0xb6 */ [this.OP_LDX, 1, this.MODE_ZPY],
            /* 0xb7 */ [],
            /* 0xb8 */ [this.OP_CLV],
            /* 0xb9 */ [this.OP_LDA, 2, this.MODE_ABSY],
            /* 0xba */ [this.OP_TSX],
            /* 0xbb */ [],
            /* 0xbc */ [this.OP_LDY, 2, this.MODE_ABSX],
            /* 0xbd */ [this.OP_LDA, 2, this.MODE_ABSX],
            /* 0xbe */ [this.OP_LDX, 2, this.MODE_ABSY],
            /* 0xbf */ [],
            /* 0xc0 */ [this.OP_CPY, 1, this.MODE_IMM],
            /* 0xc1 */ [this.OP_CMP, 1, this.MODE_INDX],
            /* 0xc2 */ [],
            /* 0xc3 */ [],
            /* 0xc4 */ [this.OP_CPY, 1, this.MODE_ZP],
            /* 0xc5 */ [this.OP_CMP, 1, this.MODE_ZP],
            /* 0xc6 */ [this.OP_DEC, 1, this.MODE_ZP],
            /* 0xc7 */ [],
            /* 0xc8 */ [this.OP_INY],
            /* 0xc9 */ [this.OP_CMP, 1, this.MODE_IMM],
            /* 0xca */ [this.OP_DEX],
            /* 0xcb */ [],
            /* 0xcc */ [this.OP_CPY, 2, this.MODE_ABS],
            /* 0xcd */ [this.OP_CMP, 2, this.MODE_ABS],
            /* 0xce */ [this.OP_DEC, 2, this.MODE_ABS],
            /* 0xcf */ [],
            /* 0xd0 */ [this.OP_BNE, 1, this.MODE_DISP],
            /* 0xd1 */ [this.OP_CMP, 1, this.MODE_INDY],
            /* 0xd2 */ [],
            /* 0xd3 */ [],
            /* 0xd4 */ [],
            /* 0xd5 */ [this.OP_CMP, 1, this.MODE_ZPX],
            /* 0xd6 */ [this.OP_DEC, 1, this.MODE_ZPX],
            /* 0xd7 */ [],
            /* 0xd8 */ [this.OP_CLD],
            /* 0xd9 */ [this.OP_CMP, 2, this.MODE_ABSY],
            /* 0xda */ [],
            /* 0xdb */ [],
            /* 0xdc */ [],
            /* 0xdd */ [this.OP_CMP, 2, this.MODE_ABSX],
            /* 0xde */ [this.OP_DEC, 2, this.MODE_ABSX],
            /* 0xdf */ [],
            /* 0xe0 */ [this.OP_CPX, 1, this.MODE_IMM],
            /* 0xe1 */ [this.OP_SBC, 1, this.MODE_INDX],
            /* 0xe2 */ [],
            /* 0xe3 */ [],
            /* 0xe4 */ [this.OP_CPX, 1, this.MODE_ZP],
            /* 0xe5 */ [this.OP_SBC, 1, this.MODE_ZP],
            /* 0xe6 */ [this.OP_INC, 1, this.MODE_ZP],
            /* 0xe7 */ [],
            /* 0xe8 */ [this.OP_INX],
            /* 0xe9 */ [this.OP_SBC, 1, this.MODE_IMM],
            /* 0xea */ [this.OP_NOP],
            /* 0xeb */ [],
            /* 0xec */ [this.OP_CPX, 2, this.MODE_ABS],
            /* 0xed */ [this.OP_SBC, 2, this.MODE_ABS],
            /* 0xee */ [this.OP_INC, 2, this.MODE_ABS],
            /* 0xef */ [],
            /* 0xf0 */ [this.OP_BEQ, 1, this.MODE_DISP],
            /* 0xf1 */ [this.OP_SBC, 1, this.MODE_INDY],
            /* 0xf2 */ [],
            /* 0xf3 */ [],
            /* 0xf4 */ [],
            /* 0xf5 */ [this.OP_SBC, 1, this.MODE_ZPX],
            /* 0xf6 */ [this.OP_INC, 1, this.MODE_ZPX],
            /* 0xf7 */ [],
            /* 0xf8 */ [this.OP_SED],
            /* 0xf9 */ [this.OP_SBC, 2, this.MODE_ABSY],
            /* 0xfa */ [],
            /* 0xfb */ [],
            /* 0xfc */ [],
            /* 0xfd */ [this.OP_SBC, 2, this.MODE_ABSX],
            /* 0xfe */ [this.OP_INC, 2, this.MODE_ABSX],
            /* 0xff */ []
        ];

    }   // endif DEBUGGER
}

if (DEBUGGER) {

    Component.subclass(C1PDebugger);

    /**
     * @this {C1PDebugger}
     * @param {string|null} sHTMLType is the type of the HTML control (eg, "button", "list", "text", "submit", "textarea", "canvas")
     * @param {string} sBinding is the value of the 'binding' parameter stored in the HTML control's "data-value" attribute (eg, "reset")
     * @param {Object} control is the HTML control DOM object (eg, HTMLButtonElement)
     * @return {boolean} true if binding was successful, false if unrecognized binding request
     */
    C1PDebugger.prototype.setBinding = function(sHTMLType, sBinding, control)
    {
        var dbg = this;
        switch(sBinding) {
        case "debugInput":
            this.bindings[sBinding] = control;
            this.eDebug = control;
            this.eDebug.focus();
            control.onkeypress = function(dbg, e) {
                return function(event) {
                    if (event.keyCode == 13) {
                        sBinding = e.value;
                        e.value = "";
                        C1PDebugger.input(dbg, sBinding);
                    }
                };
            }(this, control);
            return true;
        case "debugEnter":
            this.bindings[sBinding] = control;
            /*
             * I've replaced the standard "onclick" code with a call to our onClickRepeat() helper in
             * component.js, so that the "Enter" button can be held to repeat, just like the "Step" button.
             */
            web.onClickRepeat(
                control, 500, 100,
                function(fRepeat) {
                    if (dbg.eDebug) {
                        sBinding = dbg.eDebug.value;
                        //
                        //  If we want to use the debugEnter button to repeatedly enter the same command,
                        //  then don't clear the command string.
                        //
                        //      dbg.eDebug.value = "";
                        //
                        C1PDebugger.input(dbg, sBinding);
                        return true;
                    }
                    if (DEBUG) dbg.log("no debugger input buffer");
                    return false;
                }
            );
            return true;
        case "step":
            this.bindings[sBinding] = control;
            web.onClickRepeat(
                control, 500, 100,
                function(fRepeat) {
                    var fCompleted = false;
                    if (!dbg.isBusy(true)) {
                        dbg.setBusy(true);
                        fCompleted = dbg.step(fRepeat? 1 : 0);
                        dbg.setBusy(false);
                    }
                    return fCompleted;
                }
            );
            return true;
        default:
            break;
        }
        return false;
    };

    /**
     * @this {C1PDebugger}
     * @param {Array} abMemory
     * @param {number} start
     * @param {number} end
     */
    C1PDebugger.prototype.setBuffer = function(abMemory, start, end)
    {
        this.abMem = abMemory;
        this.offMem = start;
        this.cbMem = end - start + 1;
        this.offLimit = this.offMem + this.cbMem;
        this.setReady();
    };

    /**
     * @this {C1PDebugger}
     * @param {boolean} fOn
     * @param {C1PComputer} cmp
     */
    C1PDebugger.prototype.setPower = function(fOn, cmp)
    {
        if (fOn && !this.aFlags.fPowered) {
            this.aFlags.fPowered = true;
            this.cpu = cmp.getComponentByType("cpu");
        }
    };

    /**
     * @this {C1PDebugger}
     */
    C1PDebugger.prototype.setFocus = function()
    {
        this.eDebug.focus();
    };

    /**
     * @this {C1PDebugger}
     * @param {boolean} fClassic is true for "classic" operand syntax, or false for "modern" operand syntax
     *
     * The strings describing the operand(s) also describe the addressing mode, as follows:
     *
     *      bbb     mode    classic     modern         description
     *      ---     ----    -------     -------         ----------------
     *      000     INDX    ($nn,X)     [[nn+X]]        Indexed Indirect
     *      001     ZP      $nn         [nn]            Zero-Page
     *      010     IMM     #$nn        nn              Immediate
     *      011     ABS     $nnnn       [nnnn]          Absolute
     *      100     INDY    ($nn),Y     [[nn]+Y]        Indirect Indexed
     *      101     ZPX     $nn,X       [nn+X]          Zero-Page,X
     *      110     ABSY    $nnnn,Y     [nnnn+Y]        Absolute,Y
     *      111     ABSX    $nnnn,X     [nnnn+X]        Absolute,X
     *
     * where bbb generally corresponds to bits 2-4 of the opcode.  I find that using brackets in the
     * descriptors to indicate a memory access (or multiple brackets, in the case of indirect accesses),
     * along with "+" and any index register, is more intuitive than the "classic" operand formats;
     * the absence of any brackets implies immediate data, eliminating the need for a prepended "#".
     * Also, the use of 2-digit instead of 4-digit addresses indicates that a zero-page address is
     * being used.  Finally, all displacements/addresses and immediate values are displayed in hex by
     * default, so there is no need to waste space prepending the traditional "$" to such values.
     *
     * Other addressing modes:
     *
     *      101     ZPY     $nn,Y           Zero-Page,Y (used by LDX and STX only)
     *
     *              ACC     A               Accumulator
     *
     *              IMM16   $nnnn           Used by JSR (0x20) and JMP (0x4C); I consider this an "Immediate" operation
     *                                      that uses 16 bits, but it is documented as "Absolute" addressing (see Zaks)
     *
     *                                      FYI, this is the same operand format used for branch displacements (MODE_DISP),
     *                                      except the displacements are 8-bit values that are signed-extended to 16 bits, so
     *                                      discriminating between MODE_DISP and MODE_IMM16 also requires checking the operand size
     *
     *              ABS16   ($nnnn)         Used by JMP (0x6C); I consider this an "Absolute" operation that fetches
     *                                      16 bits of data, but it is documented as "Indirect" addressing (see Zaks)
     */
    C1PDebugger.prototype.setOpModes = function(fClassic)
    {
        /*
         * NOTE: The modes are arranged within aOpModes so that longer matches are checked before
         * any subsets that could also match (eg, check for "$nn,X" before "$nn", "$nnnn,X" before "$nnnn", etc).
         */
        this.MODE_ACC   = 0;
        this.MODE_IMM   = 1;
        this.MODE_ABSX  = 2;
        this.MODE_ABSY  = 3;
        this.MODE_IMM16 = 4;
        this.MODE_ABS16 = 5;
        this.MODE_ZPX   = 6;
        this.MODE_ZPY   = 7;
        this.MODE_INDX  = 8;
        this.MODE_INDY  = 9;
        this.MODE_ABS   = 10;
        this.MODE_ZP    = 11;
        this.MODE_DISP  = this.MODE_IMM16;

        var sRegEx = "";
        var iMode, sMode;

        if (fClassic) {
            this.aOpModes = [
                            "A",            // MODE_ACC
                /* 010b */  "#$nn",         // MODE_IMM
                /* 111b */  "$nnnn,X",      // MODE_ABSX
                /* 110b */  "$nnnn,Y",      // MODE_ABSY
                            "$nnnn",        // MODE_IMM16
                            "($nnnn)",      // MODE_ABS16
                /* 101b */  "$nn,X",        // MODE_ZPX
                            "$nn,Y",        // MODE_ZPY
                /* 000b */  "($nn,X)",      // MODE_INDX
                /* 100b */  "($nn),Y",      // MODE_INDY
                /* 011b */  "$nnnn",        // MODE_ABS
                /* 001b */  "$nn"           // MODE_ZP
            ];
            for (iMode=0; iMode < this.aOpModes.length; iMode++) {
                sMode = this.aOpModes[iMode];
                sRegEx += "(" + sMode.replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/nnnn/g, "[0-9A-F][0-9A-F][0-9A-F][0-9A-F]?").replace(/nn/g, "[0-9A-F][0-9A-F]?").replace(/\$/g, "\\$") + "|)";
            }
            this.regexOpModes = new RegExp(sRegEx);
        }
        else {
            this.aOpModes = [
                            "A",            // MODE_ACC
                /* 010b */  "nn",           // MODE_IMM
                /* 111b */  "[nnnn+X]",     // MODE_ABSX
                /* 110b */  "[nnnn+Y]",     // MODE_ABSY
                            "nnnn",         // MODE_IMM16
                            "[nnnn]",       // MODE_ABS16
                /* 101b */  "[nn+X]",       // MODE_ZPX
                            "[nn+Y]",       // MODE_ZPY
                /* 000b */  "[[nn+X]]",     // MODE_INDX
                /* 100b */  "[[nn]+Y]",     // MODE_INDY
                /* 011b */  "[nnnn]",       // MODE_ABS
                /* 001b */  "[nn]"          // MODE_ZP
            ];
            for (iMode=0; iMode < this.aOpModes.length; iMode++) {
                sMode = this.aOpModes[iMode];
                sRegEx += "(" + sMode.replace(/\[/g, "\\[").replace(/]/g, "\\]").replace(/nnnn/g, "[0-9A-F][0-9A-F][0-9A-F][0-9A-F]?").replace(/nn/g, "[0-9A-F][0-9A-F]?").replace(/\+/g, "\\+") + "|)";
            }
            this.regexOpModes = new RegExp(sRegEx);
        }
        /*
         * Regrettably, if "classic" operand syntax is in effect, then we will have to look at the context of the
         * operand (ie, the operation code) whenever we have a MODE_IMM16 (or MODE_DISP) match, because it might actually
         * be a MODE_ABS operand.  MODE_IMM16 is used with only 2 operations (OP_JSR and OP_JMP), and MODE_DISP only 8
         * (OP_BPL, OP_BMI, OP_BVC, OP_BVS, OP_BCC, OP_BCS, OP_BNE, and OP_BEQ), so if the operation isn't one of those
         * codes (in the following array), then we should convert MODE_IMM16 (aka MODE_DISP) into MODE_ABS.
         */
        this.aImm16Codes = [this.OP_JMP, this.OP_JSR, this.OP_BPL, this.OP_BMI, this.OP_BVC, this.OP_BVS, this.OP_BCC, this.OP_BCS, this.OP_BNE, this.OP_BEQ];
    };

    /**
     * @this {C1PDebugger}
     */
    C1PDebugger.prototype.halt = function()
    {
        /*
         * We ask the CPU to halt, but we can't assume it's stopped until it calls stop()
         */
        this.cpu.halt();
    };

    /**
     * @this {C1PDebugger}
     * @param {string} s is any diagnostic string that you can print later using the Debugger's "i" command
     */
    C1PDebugger.prototype.info = function(s)
    {
        if (DEBUG) {
            this.aInfoBuffer[this.iInfoBuffer++] = s;
            if (this.iInfoBuffer >= this.aInfoBuffer.length)
                this.iInfoBuffer = 0;
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {Component} component
     * @param {number} addr
     * @param {number|undefined} addrFrom
     * @param {boolean} bitsMessage is a Debugger MESSAGE_* category flag
     * @param {boolean|undefined} [fWrite] is true if this was a write, false (or undefined) if read
     * @param {string|undefined} [name] of the port, if any
     */
    C1PDebugger.prototype.messageIO = function(component, addr, addrFrom, bitsMessage, fWrite, name)
    {
        if ((this.bitsMessage & bitsMessage) == bitsMessage) {
            var b = this.cpu.getByte(addr);
            this.message(component.id + "." + (fWrite? "setByte":"getByte") + "(" + str.toHexWord(addr) + ")" + (addrFrom !== undefined? (" @" + str.toHexWord(addrFrom)) : "") + ": " + (name? (name + "=") : "") + str.toHexByte(b));
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {string} sMessage is any caller-defined message string
     */
    C1PDebugger.prototype.message = function(sMessage)
    {
        this.println(sMessage);
        this.cpu.yieldCPU();    // these print() calls are at risk of being called with high frequency, so we need to yieldCPU() more
    };

    /**
     * @this {C1PDebugger}
     */
    C1PDebugger.prototype.init = function()
    {
        // this.doHelp();
        this.println("Type ? for list of debugger commands\n");
    };

    /**
     * @this {C1PDebugger}
     * @return {boolean}
     */
    C1PDebugger.prototype.run = function()
    {
        if (!this.isCPUOK()) return false;
        this.cpu.run();
        return true;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} n (0 implies a single-step, and therefore breakpoints should be ignored)
     * @return {boolean}
     */
    C1PDebugger.prototype.step = function(n)
    {
        if (!this.isCPUOK()) return false;
        var fCompleted;
        try {
            fCompleted = this.cpu.step(n);
        }
        catch(e) {
            fCompleted = undefined;
            this.cpu.setError(e.stack || e.message);
        }
        if (fCompleted !== undefined) this.cIns++;
        /*
         * Because we called cpu.step() and not cpu.run(), we must
         * nudge the CPU's update code, and then update our own state.
         */
        this.cpu.update(true);
        this.update(true);
        return fCompleted;
    };

    /**
     * @this {C1PDebugger}
     * @param {boolean} [fStep]
     */
    C1PDebugger.prototype.update = function(fStep)
    {
        this.nextAddr = this.cpu.regPC;
        if (fStep || this.fStepOver)
            this.doIns();
        else
            this.doRegs();
    };

    /**
     * @this {C1PDebugger}
     * @return {boolean}
     *
     * Make sure the CPU is ready (finished initializing), not busy (already running), and not in an error state.
     */
    C1PDebugger.prototype.isCPUOK = function()
    {
        if (!this.cpu)
            return false;
        if (!this.cpu.isReady())
            return false;
        if (this.cpu.isBusy())
            return false;
        return !this.cpu.isError();
    };

    /**
     * @this {C1PDebugger}
     *
     * This is a notification handler, called by the CPU, to inform us that the CPU has been reset.
     */
    C1PDebugger.prototype.reset = function()
    {
        var i;
        if (!this.aStepHistory.length)
            this.aStepHistory = new Array(1000);
        for (i = 0; i < this.aStepHistory.length; i++)
            this.aStepHistory[i] = -1;
        if (!this.aaOpcodeFreqs.length)
            this.aaOpcodeFreqs = new Array(256);
        for (i = 0; i < this.aaOpcodeFreqs.length; i++)
            this.aaOpcodeFreqs[i] = [i, 0];
        if (this.cIns) this.update();
        this.cIns = 0;
        this.cReads = this.cWrites = this.cWritesZP = 0;
    };

    /**
     * @this {C1PDebugger}
     *
     * This is a notification handler, called by the CPU, to inform us that the CPU has started running.
     */
    C1PDebugger.prototype.start = function()
    {
        if (!this.fStepOver) this.println("running");
    };

    /**
     * @this {C1PDebugger}
     * @param {number} msStart
     * @param {number} nCycles
     *
     * This is a notification handler, called by the CPU, to inform us that the CPU has now stopped running.
     */
    C1PDebugger.prototype.stop = function(msStart, nCycles)
    {
        if (!this.fStepOver) {
            this.println("stopped");
            if (nCycles) {
                var msTotal = usr.getTime();
                msTotal -= msStart;
                this.println(msTotal + "ms (" + nCycles + " cycles)");
                if (DEBUG && msTotal > 0) {
                    nCycles = nCycles * 1000 / msTotal;
                    this.println("total cycles/second: " + Math.round(nCycles));
                    var percent = Math.round((this.cIns? this.cReads / this.cIns : 0) * 1000) / 10;
                    this.println("total reads: " + this.cReads + " (" + percent + "%)");
                    percent = Math.round((this.cIns? this.cWrites / this.cIns : 0) * 1000) / 10;
                    this.println("total writes: " + this.cWrites + " (" + percent + "%)");
                    percent = Math.round((this.cIns? this.cWritesZP / this.cIns : 0) * 1000) / 10;
                    this.println("total zero-page writes: " + this.cWritesZP + " (" + percent + "%)");
                    this.println("total instructions: " + this.cIns);
                }
            }
        }
        this.update();
        this.setFocus();
        if (!this.fStepOver) {
            this.cIns = 0;
            this.cReads = this.cWrites = this.cWritesZP = 0;
        }
        this.clearTempBreakpoint(this.cpu.regPC);
    };

    /**
     * @this {C1PDebugger}
     *
     * This is a check function, called by the CPU, indicating whether other instructions need to be checked.
     */
    C1PDebugger.prototype.checksEnabled = function()
    {
        return (DEBUG? true : (this.aExecBreak.length > 0 || this.aReadBreak.length > 0 || this.aWriteBreak.length > 0));
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {number} bOpCode
     * @return {boolean} true to proceed, false to halt
     *
     * This is a check function, called by the CPU, to inform us about the next instruction to be executed, giving
     * us an opportunity to look for "exec" breakpoints and update opcode frequencies and instruction history.
     */
    C1PDebugger.prototype.checkInstruction = function(addr, bOpCode)
    {
        var fBreak = false;
        if (this.checkBreakpoint(addr, this.aExecBreak, "exec"))
            fBreak = true;
        else {
            this.cIns++;
            this.aaOpcodeFreqs[bOpCode][1]++;
            this.aStepHistory[this.iStepHistory++] = this.cpu.regPC;
            if (this.iStepHistory >= this.aStepHistory.length)
                this.iStepHistory = 0;
        }
        return !fBreak;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @return {boolean} true to proceed, false to halt
     *
     * This is a check function, called by the CPU, to inform us that a memory read occurred, giving us an
     * opportunity to track the read if we want, and look for a matching "read" breakpoint, if any.
     */
    C1PDebugger.prototype.checkMemoryRead = function(addr)
    {
        var fBreak = false;
        this.cReads++;
        if (this.checkBreakpoint(addr, this.aReadBreak, "read"))
            fBreak = true;
        return !fBreak;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {number} value written
     * @return {boolean} true to proceed, false to halt
     *
     * This is a check function, called by the CPU, to inform us that a memory write occurred, giving us an
     * opportunity to track the write if we want, and look for a matching "write" breakpoint, if any.
     */
    C1PDebugger.prototype.checkMemoryWrite = function(addr, value)
    {
        var fBreak = false;
        this.cWrites++;
        /*
         * NOTE: We keep track of zero-page writes mainly as a reminder to look into whether it makes sense
         * for the CPU to calculate zero-page EAs using a different variable (eg, regEAWriteZP instead of regEAWrite),
         * because write-notification handlers never care about page zero accesses, and while write breakpoints *may*
         * care, it may not be worth the cost of tracking writes to page zero if there's an associated perf penalty.
         */
        if (!(addr & 0xff00))
            this.cWritesZP++;
        if ((value & 0xff) != value) {
            this.println("invalid value at " + str.toHexWord(addr) + ": " + value);
            fBreak = true;
        }
        if (this.checkBreakpoint(addr, this.aWriteBreak, "write"))
            fBreak = true;
        return !fBreak;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {number} b
     * @return {number}
     */
    C1PDebugger.prototype.addSignedByte = function(addr, b)
    {
        return addr + ((b << 24) >> 24);
    };

    /**
     * getByte() should be used for all memory reads performed by the Debugger (eg, doDump, doIns),
     * to insure that the CPU is properly notified (and by extension, any device that's registered a
     * notification handler with the CPU).
     *
     * @this {C1PDebugger}
     * @param {number} addr
     * @return {number|undefined}
     */
    C1PDebugger.prototype.getByte = function(addr)
    {
        var b;
        if (addr >= this.offMem && addr < this.offLimit) {
            this.cpu.checkReadNotify(addr);
            b = this.abMem[this.offMem + addr];
            Component.assert((b == (b & 0xff)), "invalid byte (" + b + ") at address: " + str.toHexWord(addr));
            b &= 0xff;
        }
        return b;
    };

    /**
     * setByte() should be used for all memory writes performed by the Debugger (eg, doAssemble, doEdit),
     * to insure that the CPU is properly notified (and by extension, any device that's registered a
     * notification handler with the CPU).
     *
     * NOTE: Even though we call all write-notification handlers, we don't include a "from" address,
     * because the write originated from the Debugger, not from a CPU instruction.  As a result, handlers should
     * not refuse the write unless they have good reason; in particular, the ROM handlers will not refuse our writes,
     * allowing the Debugger to modify ROM contents as needed.
     *
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {number} b
     */
    C1PDebugger.prototype.setByte = function(addr, b)
    {
        if (addr < this.offMem || addr >= this.offLimit) {
            this.println("invalid address: " + str.toHexWord(addr));
            return;
        }
        this.abMem[this.offMem + addr] = (b & 0xff);
        this.cpu.checkWriteNotify(addr);
        this.cpu.update();
    };

    /**
     * @this {C1PDebugger}
     */
    C1PDebugger.prototype.clearBreakpoints = function()
    {
        this.aExecBreak = [];
        this.aReadBreak = [];
        this.aWriteBreak = [];
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @return {boolean}
     */
    C1PDebugger.prototype.addExecBreakpoint = function(addr)
    {
        if (!this.findExecBreakpoint(addr)) {
            this.aExecBreak.push(addr);
        }
        return true;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @return {boolean}
     */
    C1PDebugger.prototype.addReadBreakpoint = function(addr)
    {
        if (!this.findReadBreakpoint(addr)) {
            this.aReadBreak.push(addr);
        }
        return true;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @return {boolean}
     */
    C1PDebugger.prototype.addWriteBreakpoint = function(addr)
    {
        if (!this.findWriteBreakpoint(addr)) {
            this.aWriteBreak.push(addr);
        }
        return true;
    };

    /**
     * @this {C1PDebugger}
     * @return {Array}
     */
    C1PDebugger.prototype.getExecBreakpoints = function()
    {
        return this.aExecBreak;
    };

    /**
     * @this {C1PDebugger}
     * @return {Array}
     */
    C1PDebugger.prototype.getReadBreakpoints = function()
    {
        return this.aReadBreak;
    };

    /**
     * @this {C1PDebugger}
     * @return {Array}
     */
    C1PDebugger.prototype.getWriteBreakpoints = function()
    {
        return this.aWriteBreak;
    };

    /**
     * @this {C1PDebugger}
     * @param {Array} aBreak
     * @param {number} addr
     * @param {boolean} [fRemove]
     * @return {boolean}
     */
    C1PDebugger.prototype.findBreakpoint = function(aBreak, addr, fRemove)
    {
        var fMatch = false;
        for (var i=0; i < aBreak.length; i++) {
            if (aBreak[i] == addr) {
                if (fRemove) {
                    aBreak.splice(i, 1);
                }
                fMatch = true;
                break;
            }
        }
        return fMatch;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {boolean} [fRemove]
     * @return {boolean}
     */
    C1PDebugger.prototype.findExecBreakpoint = function(addr, fRemove)
    {
        return this.findBreakpoint(this.aExecBreak, addr, fRemove);
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {boolean} [fRemove]
     * @return {boolean}
     */
    C1PDebugger.prototype.findReadBreakpoint = function(addr, fRemove)
    {
        return this.findBreakpoint(this.aReadBreak, addr, fRemove);
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {boolean} [fRemove]
     * @return {boolean}
     */
    C1PDebugger.prototype.findWriteBreakpoint = function(addr, fRemove)
    {
        return this.findBreakpoint(this.aWriteBreak, addr, fRemove);
    };

    /**
     * @this {C1PDebugger}
     * @param {number|undefined} addr of new temp breakpoint
     */
    C1PDebugger.prototype.setTempBreakpoint = function(addr)
    {
        if (addr !== undefined) {
            /*
             * I don't want temporary breakpoints growing out of control, so I forcibly clear any
             * existing temp breakpoint by feeding clearTempBreakpoint() the current temp address, if any;
             * but you can remove the next line if you decide multiple temp breakpoints are a good thing.
             */
            this.clearTempBreakpoint(this.addrTempBP);
            if (this.addExecBreakpoint(addr))
                this.addrTempBP = addr;
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr to compare to addrTempBP; the latter is cleared if there's a match
     */
    C1PDebugger.prototype.clearTempBreakpoint = function(addr)
    {
        if (this.addrTempBP !== undefined && addr == this.addrTempBP) {
            if (this.findExecBreakpoint(this.addrTempBP, true)) {
                this.addrTempBP = undefined;
            }
        }
        this.fStepOver = false;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {Array} aBreakpoints
     * @param {string} sType (ie, "exec" or "write")
     * @return {boolean} true if breakpoint has been hit, false if not
     */
    C1PDebugger.prototype.checkBreakpoint = function(addr, aBreakpoints, sType)
    {
        /*
         * Time to check for execution breakpoints; note that this should be done BEFORE updating any of the frequency
         * or history data (see checkInstruction), since we might not actually execute the current instruction.
         */
        var fBreak = false;
        for (var i=0; i < aBreakpoints.length; i++) {
            if (aBreakpoints[i] == addr) {
                if (addr != this.addrTempBP)
                    this.println("breakpoint hit: " + str.toHexWord(addr) + " (" + sType + ")");
                fBreak = true;
                break;
            }
        }
        return fBreak;
    };

    /**
     * @this {C1PDebugger}
     * @param {number} addr
     * @param {number} [nIns] is an associated instruction number, or 0 (or undefined) if none
     * @return {string}
     */
    C1PDebugger.prototype.getIns = function(addr, nIns)
    {
        var sLine = str.toHex(addr, 4);
        var bOpCode = this.getByte(addr++);
        var aOpDesc = this.aaOperations[bOpCode];
        var b = (bOpCode === undefined? 0 : bOpCode);
        var abOperand = [];
        var cb = (aOpDesc[1] === undefined? 0 : aOpDesc[1]);
        do {
            sLine += " " + str.toHex(b, 2);
            if (!(cb--)) break;
            b = this.getByte(addr++);
            if (b === undefined) break;
            abOperand.push(b);
        } while (true);
        if (aOpDesc[0] === undefined) {
            aOpDesc = [this.OP_DB, 1, this.MODE_IMM];
            abOperand.push(bOpCode);
        }
        sLine = (sLine + "        ").substr(0, 15);
        sLine += this.aOpCodes[aOpDesc[0]];
        var sOperand = null;
        if (aOpDesc[2] !== undefined) {
            var bOpMode = aOpDesc[2];
            sOperand = this.aOpModes[bOpMode];
            if (aOpDesc[1] == 1 && bOpMode == this.MODE_DISP) {
                sOperand = sOperand.replace(/nnnn/, str.toHex(this.addSignedByte(addr, b = abOperand.pop()), 4));
            }
            else {
                while (abOperand.length) {
                    sOperand = sOperand.replace(/nn/, str.toHex(b = abOperand.pop(), 2));
                }
            }
            if (bOpMode == this.MODE_IMM && aOpDesc[1] == 1) {
                if (b >= 0x20 && b < 0x80)
                    sOperand += " ;'" + String.fromCharCode(b) + "'";
            }
        }
        if (bOpCode == this.cpu.OP_SIM) {
            if (b < this.aOpSimCodes.length)
                sOperand = this.aOpSimCodes[b];
            if (b == this.cpu.SIMOP_MSG) {
                cb = 0;
                sOperand = "\"";
                while ((b = this.getByte(addr++))) {
                    if (cb < 16)
                        sOperand += String.fromCharCode(b);
                    else if (cb == 16)
                        sOperand += "…";
                    cb++;
                }
                sOperand += "\"";
            }
        }
        if (sOperand) sLine += " " + sOperand;
        if (nIns) {
            sLine += "               ";
            sLine = sLine.substr(0, 30);
            sLine += ";" + nIns.toString();
        }
        this.nextIns = addr;
        return sLine;
    };

    /**
     * parseIns(sCode, sOperand, addr) generally requires an exact match of both the operation code
     * (sCode) and mode operand (sOperand) against the aOpCodes[] and aOpModes[] arrays, respectively;
     * however, the regular expression built from aOpModes and stored in regexOpModes does relax the matching
     * criteria slightly; ie, a 4-digit hex value ("nnnn") will be satisfied with either 3 or 4 digits, and
     * similarly, a 2-digit hex address (nn) will be satisified with either 1 or 2 digits.
     *
     * Note that this function does not actually store the instruction into memory, even though it requires
     * a target address (addr); that parameter is currently needed ONLY for "branch" instructions, because in
     * order to calculate the branch displacement, it needs to know where the instruction will ultimately be
     * stored, relative to its target address.
     *
     * Another handy feature of this function is its ability to display all available modes for a particular
     * operation. For example, while in "assemble mode", if one types:
     *
     *      ldy?
     *
     * the Debugger will display:
     *
     *      supported opcodes:
     *           A0: LDY nn
     *           A4: LDY [nn]
     *           AC: LDY [nnnn]
     *           B4: LDY [nn+X]
     *           BC: LDY [nnnn+X]
     *
     * Use of a trailing "?" on any opcode will display all variations of that opcode; no instruction will be
     * assembled, and the operand parameter, if any, will be ignored.
     *
     * Although this function is capable of reporting numerous errors, roughly half of them indicate internal
     * consistency errors, not user errors; the former should really be asserts, but I'm not comfortable bombing
     * out because of my error as opposed to their error.  The only errors a user should expect to see:
     *
     *      "unknown operation":    sCode is not a valid operation (per aOpCodes)
     *      "unknown operand":      sOperand is not a valid operand (per aOpModes)
     *      "unknown instruction":  the combination of sCode + sOperand does not exist (per aaOperations)
     *      "branch out of range":  the branch address, relative to addr, is too far away
     *
     * @this {C1PDebugger}
     * @param {string} sCode
     * @param {string|undefined} sOperand
     * @param {number} addr of memory where this instruction is being assembled
     * @return {Array.<number>} of opcode bytes; if the instruction can't be parsed, the array will be empty
     */
    C1PDebugger.prototype.parseIns = function(sCode, sOperand, addr)
    {
        var aOpBytes = [];
        if (sCode !== undefined) {
            var iCode, iMode;
            /*
             * Find the iCode that corresponds to the given operation code
             */
            sCode = sCode.toUpperCase();
            if (sCode.charAt(sCode.length-1) == "?") {
                sOperand = "?";
                sCode = sCode.substr(0, sCode.length-1);
            }
            for (iCode=0; iCode < this.aOpCodes.length; iCode++) {
                if (sCode == this.aOpCodes[iCode]) {
                    break;
                }
            }
            if (iCode == this.aOpCodes.length) {
                this.println("unknown operation: " + sCode);
                iCode = -1;
            }
            var sMode = "", aModeMatch, i;
            if (iCode >= 0 && sOperand !== undefined) {
                sMode = sOperand.toUpperCase();
                if (sMode == "?") {
                    var cModes = 0;
                    for (i = 0; i < this.aaOperations.length; i++) {
                        if (this.aaOperations[i][0] === iCode) {
                            if (!cModes) this.println("supported opcodes:");
                            this.println("     " + str.toHex(i, 2) + ": " + sCode + (this.aaOperations[i][2] !== undefined? (" " + this.aOpModes[this.aaOperations[i][2]]) : ""));
                            cModes++;
                        }
                    }
                    iCode = -1;
                }
                else {
                    /*
                     * Find the iMode that corresponds to the given operand
                     */
                    aModeMatch = sMode.match(this.regexOpModes);
                    if (aModeMatch !== null && aModeMatch[0] == sMode) {
                        /*
                         * One of the sub-patterns must have matched as well; the index of the matching
                         * sub-pattern will correspond to the proper aOpModes index, albeit off-by-one since
                         * the regex match at [0] is the complete match, not a sub-pattern match.
                         */
                        for (i = 1; i < aModeMatch.length; i++) {
                            if (aModeMatch[i] == sMode) {
                                if (iMode === undefined)
                                    iMode = i-1;
                                else {
                                    /*
                                     * This is really an internal consistency error; regardless what the user types, this should not occur.
                                     */
                                    //noinspection JSUnusedAssignment
                                    this.println("too many operand matches (both " + this.aOpModes[iMode] + " and " + this.aOpModes[i-1] + ")");
                                    iCode = -1;
                                    break;
                                }
                            }
                        }
                        /*
                         * Regrettably, if "classic" operand syntax is in effect, then we must look at the context of the
                         * operand (ie, the operation code) whenever we have a MODE_IMM16 (or MODE_DISP) match, because it might
                         * actually be a MODE_ABS operand; see setOpModes() for details of the aImm16Codes array.
                         */
                        if (iMode == this.MODE_IMM16) {
                            if (this.aImm16Codes.indexOf(iCode) < 0)
                                iMode = this.MODE_ABS;
                        }
                        /*
                         * Even in "modern" syntax mode, we have to look at the context of a MODE_ABS16 match, because unless
                         * the operation is OP_JMP, then the mode must actually be MODE_ABS.
                         */
                        if (iMode == this.MODE_ABS16) {
                            if (iCode != this.OP_JMP)
                                iMode = this.MODE_ABS;
                        }
                    }
                    else {
                        this.println("unknown operand: " + sMode);
                        iCode = -1;
                    }
                }
            }
            if (iCode >= 0) {
                /*
                 * So we have an iCode and possibly an iMode; find the one (and hopefully only) aaOperations instruction entry that matches
                 */
                var bOpCode = -1;
                for (i = 0; i < this.aaOperations.length; i++) {
                    if (this.aaOperations[i][0] === iCode && this.aaOperations[i][2] === iMode) {
                        if (bOpCode < 0)
                            bOpCode = i;
                        else {
                            /*
                             * This is really an internal consistency error; regardless what the user types, this should not occur.
                             */
                            this.println("too many instruction matches (both " + str.toHexByte(bOpCode) + " and " + str.toHexByte(i) + ")");
                            bOpCode = -2;
                            break;
                        }
                    }
                }
                if (bOpCode >= 0) {
                    aOpBytes.push(bOpCode);
                    if (iMode !== undefined) {
                        var cb = this.aaOperations[bOpCode][1];
                        var asHex = sMode.match(/[0-9A-F]+/);
                        if (asHex !== null) {
                            var nHex = parseInt(asHex[0], 16);
                            if (cb == 1 && iMode == this.MODE_DISP) {
                                nHex -= (addr + 2);
                                if (nHex < -128 || nHex > 127) {
                                    this.println("branch out of range (" + nHex + ")");
                                    aOpBytes = [];
                                    cb = 0;
                                }
                            }
                            for (i = 0; i < cb; i++) {
                                aOpBytes.push(nHex & 0xff);
                                nHex >>>= 8;
                            }
                        }
                        else if (cb) {
                            /*
                             * This is really an internal consistency error; regardless what the user types, this should not occur.
                             */
                            this.println("instruction missing " + cb + " bytes");
                        }
                    }
                }
                else {
                    this.println("unknown instruction: " + sCode + " " + sMode + (DEBUG? (" (" + iMode + ")") : ""));
                }
            }
        }
        return aOpBytes;
    };

    /**
     * @this {C1PDebugger}
     * @return {string}
     */
    C1PDebugger.prototype.getRegs = function()
    {
        return "A=" + str.toHex(this.cpu.regA, 2) +
              " X=" + str.toHex(this.cpu.regX, 2) +
              " Y=" + str.toHex(this.cpu.regY, 2) +
              " P=" + str.toHex(this.cpu.getRegP(), 2) +
              " S=" + str.toHex(this.cpu.regS, 4) +
              " PC=" + str.toHex(this.cpu.regPC, 4);
    };

    /**
     * @this {C1PDebugger}
     * @param {string|undefined} [sAddr]
     * @return {number|undefined}
     */
    C1PDebugger.prototype.getUserAddr = function(sAddr)
    {
        var addr = this.nextAddr;
        if (sAddr !== undefined) {
            var nBase = 16;
            if (sAddr.charAt(0) == "$")
                sAddr = sAddr.substr(1);
            else
            if (sAddr.substr(0, 2) == "0x")
                sAddr = sAddr.substr(2);
            else
            if (sAddr.charAt(sAddr.length-1) == ".") {
                nBase = 10;
                sAddr = sAddr.substr(0, sAddr.length-1);
            }
            addr = parseInt(sAddr, nBase);
            if (isNaN(addr)) {
                this.println("invalid base-" + nBase + " address: " + sAddr);
                addr = undefined;
            }
        }
        if (addr !== undefined && (addr < this.offMem || addr >= this.offLimit)) {
            this.println("address out of range: " + str.toHex(addr));
            addr = undefined;
        }
        return addr;
    };

    /**
     * @this {C1PDebugger}
     */
    C1PDebugger.prototype.doHelp = function()
    {
        this.println("\ncommands:\n?\thelp\na [#]\tassemble\nb [#]\tbreakpoint\nd [#]\tdump memory\ne [#]\tedit memory\nf\tdump frequencies\ng [#]\trun to [#]\nh\thalt\no\toptions\np [#]\tdump history\nr\tdump/edit registers\ns\tstep over instruction\nt [#]\tstep instruction(s)\nu [#]\tunassemble");
        this.println("note: frequency and history commands operate only when breakpoints are set");
    };

    /**
     * doAssemble() always receives the complete argument array, where the order of the arguments is:
     *
     *      [0]: the assemble command (assumed to be "a")
     *      [1]: the target address (eg, "200")
     *      [2]: the operation code, aka mnemonic (eg, "adc")
     *      [3]: the operation mode operand, if any (eg, "14", "[1234]", etc)
     *
     * The Debugger enters "assemble mode" whenever only the first (or first and second) arguments are present.
     * As long as "assemble mode is active, the user can omit the first two arguments on all later assemble commands
     * until "assemble mode" is cancelled with an empty command line; the command processor automatically prepends "a"
     * and the next available target address to the argument array.
     *
     * Entering "assemble mode" is optional; one could enter a series of fully-qualified assemble commands; eg:
     *
     *      a ff00 cld
     *      a ff01 ldx 28
     *      ...
     *
     * without ever entering "assemble mode", but of course, that requires more typing and doesn't take advantage
     * of automatic target address advancement (see addrAssembleNext).
     *
     * NOTE: As the previous example implies, you can even assemble new instructions into ROM address space;
     * as our setByte() function explains, the ROM write-notification handlers only refuse writes from the CPU.
     *
     * @this {C1PDebugger}
     * @param {Array.<string>} asArgs is the complete argument array, beginning with the "a" command in asArgs[0]
     */
    C1PDebugger.prototype.doAssemble = function(asArgs)
    {
        var addr = this.getUserAddr(asArgs[1]);
        if (addr === undefined)
            return;
        this.addrAssembleNext = addr;
        if (asArgs[2] === undefined) {
            this.println("begin assemble @" + str.toHexWord(this.addrAssembleNext));
            this.fAssemble = true;
            this.cpu.update();
            return;
        }
        var aOpBytes = this.parseIns(asArgs[2], asArgs[3], this.addrAssembleNext);
        if (aOpBytes.length) {
            for (var i=0; i < aOpBytes.length; i++) {
                // this.println(str.toHexWord(this.addrAssembleNext) + ": " + str.toHexByte(aOpBytes[i]));
                this.setByte(this.addrAssembleNext+i, aOpBytes[i]);
            }
            this.println(this.getIns(this.addrAssembleNext));
            this.addrAssembleNext += aOpBytes.length;
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {string} [sParm]
     * @param {string} [sAddr]
     */
    C1PDebugger.prototype.doBreak = function(sParm, sAddr)
    {
        if (sParm === undefined || sParm == "?") {
            this.println("\nbreakpoint commands:");
            this.println("bp [a]\tset exec breakpoint at [a]");
            this.println("br [a]\tset read breakpoint at [a]");
            this.println("bw [a]\tset write breakpoint at [a]");
            this.println("bc [a]\tclear breakpoint at [a]");
            this.println("bl\tlist all breakpoints");
            return;
        }
        if (sAddr === undefined && sParm.length > 1) {
            sAddr = sParm.substr(1);
            sParm = sParm.substr(0, 1);
        }
        if (sParm == "l") {
            var cBreaks = 0, i;
            var aAddrs = this.getExecBreakpoints();
            for (i = 0; i < aAddrs.length; i++) {
                this.println("breakpoint enabled: " + str.toHexWord(aAddrs[i]) + " (exec)");
                cBreaks++;
            }
            aAddrs = this.getReadBreakpoints();
            for (i = 0; i < aAddrs.length; i++) {
                this.println("breakpoint enabled: " + str.toHexWord(aAddrs[i]) + " (read)");
                cBreaks++;
            }
            aAddrs = this.getWriteBreakpoints();
            for (i = 0; i < aAddrs.length; i++) {
                this.println("breakpoint enabled: " + str.toHexWord(aAddrs[i]) + " (write)");
                cBreaks++;
            }
            if (!cBreaks)
                this.println("no breakpoints");
            return;
        }
        if (sAddr === undefined) {
            this.println("missing breakpoint address");
            return;
        }
        if (sParm == "c" && sAddr == "*") {
            this.clearBreakpoints();
            this.println("all breakpoints cleared");
            return;
        }
        var addr = this.getUserAddr(sAddr);
        if (addr === undefined)
            return;
        if (sParm == "p") {
            if (this.addExecBreakpoint(addr))
                this.println("breakpoint enabled: " + str.toHexWord(addr) + " (exec)");
            else
                this.println("breakpoint not set: " + str.toHexWord(addr));
            return;
        }
        if (sParm == "c") {
            if (this.findExecBreakpoint(addr, true))
                this.println("breakpoint cleared: " + str.toHexWord(addr) + " (exec)");
            else
            if (this.findReadBreakpoint(addr, true))
                this.println("breakpoint cleared: " + str.toHexWord(addr) + " (read)");
            else
            if (this.findWriteBreakpoint(addr, true))
                this.println("breakpoint cleared: " + str.toHexWord(addr) + " (write)");
            else
                this.println("breakpoint missing: " + str.toHexWord(addr));
            return;
        }
        if (sParm == "r") {
            if (this.addReadBreakpoint(addr))
                this.println("breakpoint enabled: " + str.toHexWord(addr) + " (read)");
            else
                this.println("breakpoint not set: " + str.toHexWord(addr));
            return;
        }
        if (sParm == "w") {
            if (this.addWriteBreakpoint(addr))
                this.println("breakpoint enabled: " + str.toHexWord(addr) + " (write)");
            else
                this.println("breakpoint not set: " + str.toHexWord(addr));
            return;
        }
        this.println("unknown breakpoint command: " + sParm);
    };

    /**
     * @this {C1PDebugger}
     * @param {string} sAddr
     * @param {string} sLen
     */
    C1PDebugger.prototype.doDump = function(sAddr, sLen)
    {
        if (sAddr == "?") {
            this.println("\ndump commands:");
            this.println("d [a] [#]    dump # lines of memory");
            return;
        }
        var addr = this.getUserAddr(sAddr);
        if (addr === undefined)
            return;
        var cLines = 0;
        if (sLen !== undefined) {
            if (sLen.charAt(0) == "l")
                sLen = sLen.substr(1);
            cLines = parseInt(sLen, 10);
        }
        if (!cLines) cLines = 1;
        for (var line=0; line < cLines; line++) {
            var sBytes = "";
            var sChars = "";
            var addrLine = addr;
            for (var i=0; i < 8 && addr < this.offLimit; i++) {
                var b = this.getByte(addr);
                if (b === undefined) b = 0;
                sBytes += str.toHex(b, 2) + " ";
                sChars += (b >= 32 && b < 128? String.fromCharCode(b) : ".");
                addr++;
            }
            this.println(str.toHex(addrLine, 4) + " " + sBytes + sChars);
        }
        this.nextAddr = addr;
    };

    /**
     * @this {C1PDebugger}
     * @param {Array.<string>} asArgs
     */
    C1PDebugger.prototype.doEdit = function(asArgs)
    {
        var sAddr = asArgs[1];
        if (sAddr === undefined) {
            this.println("missing address");
            return;
        }
        var addr = this.getUserAddr(sAddr);
        if (addr === undefined)
            return;
        for (var i=2; i < asArgs.length; i++) {
            var b = parseInt(asArgs[i], 16);
            this.setByte(addr++, b);
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {string} sParm
     */
    C1PDebugger.prototype.doFreqs = function(sParm)
    {
        if (sParm == "?") {
            this.println("\nfrequency commands:");
            this.println("clear\tclear all frequency counts");
            return;
        }
        var cData = 0, i;
        if (this.aaOpcodeFreqs) {
            if (sParm == "clear") {
                for (i = 0; i < this.aaOpcodeFreqs.length; i++)
                    this.aaOpcodeFreqs[i] = [i, 0];
                this.println("frequency data cleared");
                cData++;
            }
            else if (sParm !== undefined) {
                this.println("unknown frequency command: " + sParm);
                cData++;
            }
            else {
                var aaSortedOpcodeFreqs = this.aaOpcodeFreqs.slice();
                aaSortedOpcodeFreqs.sort(function(p, q) {return q[1] - p[1];});
                for (i = 0; i < aaSortedOpcodeFreqs.length; i++) {
                    var bOpcode = aaSortedOpcodeFreqs[i][0];
                    var cFreq = aaSortedOpcodeFreqs[i][1];
                    if (cFreq) {
                        this.println(this.aOpCodes[this.aaOperations[bOpcode][0]] + " (" + str.toHexByte(bOpcode) + "): " + cFreq + " times");
                        cData++;
                    }
                }
            }
        }
        if (!cData) {
            this.println("no frequency data available");
        }
    };

    /**
     * @this {C1PDebugger}
     */
    C1PDebugger.prototype.doHalt = function()
    {
        this.halt();
    };

    /**
     * @this {C1PDebugger}
     * @param {string} sCount
     */
    C1PDebugger.prototype.doHistory = function(sCount)
    {
        var cLines = 10;
        var iHistory = this.iStepHistory;
        var aHistory = this.aStepHistory;
        if (aHistory !== undefined) {
            var n = (sCount === undefined? this.nextHistory : parseInt(sCount, 10));
            if (n === undefined)
                n = 10;
            if (n > aHistory.length) {
                this.println("note: only " + aHistory.length + " available");
                n = aHistory.length;
            }
            if (sCount !== undefined) {
                this.nInsHistory = 0;
                this.println(n + " instructions earlier:");
            }
            var nIns = (this.nInsHistory? this.nInsHistory : 1);
            iHistory -= n;
            if (iHistory < 0) iHistory = aHistory.length - 1;
            while (cLines && iHistory != this.iStepHistory) {
                var addr = aHistory[iHistory];
                if (addr < 0) break;
                this.println(this.getIns(addr, nIns++));
                if (++iHistory == aHistory.length) iHistory = 0;
                cLines--;
                n--;
            }
            this.nextHistory = n;
            this.nInsHistory = nIns;
        }
        if (cLines == 10) this.println("no history available");
    };

    /**
     * Prints the contents of the Debugger's "info" buffer (filled by calls like cpu.dbg.info())
     * @this {C1PDebugger}
     * @param {string|undefined} sCount
     * @return {boolean|undefined} true only if the "info" command is supported
     */
    C1PDebugger.prototype.doInfo = function(sCount)
    {
        if (DEBUG) {
            var cLines = (sCount === undefined? -1 : parseInt(sCount, 10));
            var i = this.iInfoBuffer;
            do {
                var s = this.aInfoBuffer[i++];
                if (s !== undefined) {
                    this.println(s);
                    cLines--;
                }
                if (i >= this.aInfoBuffer.length)
                    i = 0;
            } while (cLines && i != this.iInfoBuffer);
            this.println("nYieldsPerSecond: " + this.cpu.nYieldsPerSecond);
            this.println("msPerYield: " + this.cpu.msPerYield);
            this.println("nCyclesPerBurst: " + this.cpu.nCyclesPerBurst);
            this.println("nCyclesPerYield: " + this.cpu.nCyclesPerYield);
            this.println("nCyclesPerVideoUpdate: " + this.cpu.nCyclesPerVideoUpdate);
            this.println("nCyclesPerStatusUpdate: " + this.cpu.nCyclesPerStatusUpdate);
            return true;
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {string} [sAddr]
     * @param {string} [sAddrEnd]
     * @param {number} [n]
     */
    C1PDebugger.prototype.doIns = function(sAddr, sAddrEnd, n)
    {
        var addr = this.getUserAddr(sAddr);
        if (addr === undefined)
            return;

        if (n === undefined) n = 1;
        var addrEnd = this.offLimit;
        if (sAddrEnd !== undefined) {
            addrEnd = this.getUserAddr(sAddrEnd);
            if (addrEnd === undefined || addrEnd < addr)
                return;
            if (!DEBUG && (addrEnd - addr) > 0x100) {
                /*
                 * Limiting the amount of disassembled code to 1 page in non-DEBUG builds is partly to
                 * prevent the user from wedging their browser, but also a recognition that, in non-DEBUG builds,
                 * Component.println() also keeps its output buffer truncated to 8K, which is only enough for
                 * about 2 pages of disassembled code anyway.
                 */
                this.println("range too large");
                return;
            }
            addrEnd++;
            n = -1;
        }

        if (addr != this.nextAddr)
            this.println();

        while (n-- && addr < addrEnd) {
            var sIns = this.getIns(addr, this.isBusy(false) || this.fStepOver? this.cIns : 0);
            this.println(sIns);
            this.nextAddr = addr = this.nextIns;
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {Array.<string>} asArgs
     */
    C1PDebugger.prototype.doOptions = function(asArgs)
    {
        if (asArgs[1] === undefined || asArgs[1] == "?") {
            this.println("\noption commands:");
            this.println("max\trun at maximum speed");
            this.println("fast\trun faster (up to " + this.cpu.mhzFast + "Mhz)");
            this.println("slow\trun at normal speed (1Mhz)");
            this.println("classic\tuse classic operand syntax");
            this.println("modern\tuse modern operand syntax");
            this.println("msg\tenable message categories");
            return;
        }
        var sOption = asArgs[1];
        switch(sOption) {
        case "slow":
            this.cpu.setSpeed(this.cpu.SPEED_SLOW);
            break;
        case "fast":
            this.cpu.setSpeed(this.cpu.SPEED_FAST);
            break;
        case "max":
            this.cpu.setSpeed(this.cpu.SPEED_MAX);
            break;
        case "classic":
            this.setOpModes(true);
            this.println("classic syntax enabled");
            break;
        case "modern":
            this.setOpModes(false);
            this.println("modern syntax enabled");
            break;
        case "msg":
            var bitsMessage = 0;
            if (asArgs[2] !== undefined) {
                if (asArgs[2] == "all")
                    bitsMessage = 0xff;
                else if (this.aMessageCategories[asArgs[2]] !== undefined)
                    bitsMessage = this.aMessageCategories[asArgs[2]];
                if (bitsMessage) {
                    if (asArgs[3] == "on") {
                        this.bitsMessage |= bitsMessage;
                    }
                    else if (asArgs[3] == "off") {
                        this.bitsMessage &= ~bitsMessage;
                    }
                }
            }
            for (var sCategory in this.aMessageCategories) {
                if (asArgs[2] !== undefined && (asArgs[2] != "all" && asArgs[2] != sCategory)) continue;
                bitsMessage = this.aMessageCategories[sCategory];
                this.println(sCategory + " messages: " + ((this.bitsMessage & bitsMessage)? "on" : "off"));
            }
            break;
        default:
            this.println("unknown option: " + sOption);
            break;
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {Array.<string>} [asArgs]
     */
    C1PDebugger.prototype.doRegs = function(asArgs)
    {
        if (asArgs && asArgs[1] == "?") {
            this.println("\nregister commands:");
            this.println("r to display all");
            this.println("r [target=value] to modify");
            this.println("supported targets:");
            this.println("A,X,Y,S,PC and flags C,Z,D,V,N");
            return;
        }
        var fIns = true;
        if (asArgs !== undefined && asArgs.length > 1) {
            fIns = false;
            var sReg = asArgs[1];
            var sValue = null;
            var i = sReg.indexOf("=");
            if (i > 0) {
                sValue = sReg.substr(i+1);
                sReg = sReg.substr(0, i);
            }
            else if (asArgs.length > 2) {
                sValue = asArgs[2];
            }
            else {
                this.println("missing value for " + asArgs[1]);
                return;
            }
            var b = parseInt(sValue, 16);
            if (!isNaN(b)) {
                switch(sReg.toUpperCase()) {
                case "A":
                    this.cpu.regA = b & 0xff;
                    break;
                case "X":
                    this.cpu.regX = b & 0xff;
                    break;
                case "Y":
                    this.cpu.regY = b & 0xff;
                    break;
                case "C":
                    if (b) this.cpu.setC(); else this.cpu.clearC();
                    break;
                case "Z":
                    if (b) this.cpu.setZ(); else this.cpu.clearZ();
                    break;
                case "D":
                    if (b) this.cpu.setBCD(); else this.cpu.clearBCD();
                    break;
                case "V":
                    if (b) this.cpu.setV(); else this.cpu.clearV();
                    break;
                case "N":
                    if (b) this.cpu.setN(); else this.cpu.clearN();
                    break;
                case "S":
                    if ((b & ~0xff) != 0x100) {
                        this.println("invalid stack pointer: " + sValue);
                        return;
                    }
                    this.cpu.regS = b;
                    break;
                case "PC":
                    fIns = true;
                    this.cpu.regPC = b & 0xffff;
                    this.nextAddr = this.cpu.regPC;
                    break;
                default:
                    this.println("unknown register: " + sReg);
                    return;
                }
            }
            else {
                this.println("invalid value: " + sValue);
                return;
            }
            this.cpu.update();
        }
        this.println(this.getRegs());
        if (fIns) this.doIns(str.toHex(this.nextAddr = this.cpu.regPC, 4));
    };

    /**
     * @this {C1PDebugger}
     * @param {string} sAddr
     */
    C1PDebugger.prototype.doRun = function(sAddr)
    {
        if (sAddr !== undefined)
            this.setTempBreakpoint(this.getUserAddr(sAddr));
        if (!this.run()) {
            this.cpu.setFocus();
        }
    };

    /**
     * @this {C1PDebugger}
     */
    C1PDebugger.prototype.doStep = function()
    {
        if (this.getByte(this.cpu.regPC) == this.cpu.OP_JSR) {
            this.setTempBreakpoint(this.cpu.regPC+3);
            this.fStepOver = true;
            if (!this.run())
                this.cpu.setFocus();
        }
        else {
            this.doTrace();
        }
    };

    /**
     * @this {C1PDebugger}
     * @param {string} [sCount]
     */
    C1PDebugger.prototype.doTrace = function(sCount)
    {
        var c = (sCount === undefined? 1 : parseInt(sCount, 10));
        var n = (c == 1? 0 : 1);
        web.onCountRepeat(
            c,
            function(dbg) {
                return function() {
                    return dbg.setBusy(true) && dbg.step(n);
                };
            }(this),
            function(dbg) {
                return function() {
                    dbg.setBusy(false);
                };
            }(this)
        );
    };

    C1PDebugger.input = function(dbg, sCmd)
    {
        if (!sCmd.length) {
            if (dbg.fAssemble) {
                dbg.println("ended assemble @" + str.toHex(dbg.addrAssembleNext, 4));
                dbg.nextAddr = dbg.addrAssembleNext;
                dbg.fAssemble = false;
            }
            else
            if (dbg.prevCmd)
                sCmd = dbg.prevCmd;
        }
        if (dbg.isReady() && !dbg.isBusy(true) && sCmd.length > 0) {

            if (dbg.fAssemble) {
                sCmd = "a " + str.toHex(dbg.addrAssembleNext, 4) + " " + sCmd;
            }
            else if (sCmd.length > 1 && sCmd.indexOf(" ") != 1) {
                /*
                 * For certain commands lacking a space after the first character,
                 * insert an automatic space, so that split(" ") has the desired effect.
                 */
                var ch = sCmd.charAt(0).toLowerCase();
                sCmd = ch + " " + sCmd.substr(1);
            }

            var asArgs = sCmd.split(" ");
            dbg.prevCmd = asArgs[0];

            switch(asArgs[0].toLowerCase()) {
            case "a":
                dbg.doAssemble(asArgs);
                break;
            case "b":
                dbg.doBreak(asArgs[1], asArgs[2]);
                break;
            case "d":
                dbg.doDump(asArgs[1], asArgs[2]);
                break;
            case "e":
                dbg.doEdit(asArgs);
                break;
            case "f":
                dbg.doFreqs(asArgs[1]);
                break;
            case "g":
                dbg.doRun(asArgs[1]);
                break;
            case "h":
                dbg.doHalt();
                break;
            case "o":
                dbg.doOptions(asArgs);
                break;
            case "p":
                dbg.doHistory(asArgs[1]);
                break;
            case "r":
                dbg.doRegs(asArgs);
                break;
            case "s":
                dbg.doStep();
                break;
            case "t":
                dbg.doTrace(asArgs[1]);
                break;
            case "u":
                dbg.doIns(asArgs[1], asArgs[2], 8);
                break;
            case "?":
            case "help":
                dbg.doHelp();
                break;
            case "i":
                if (dbg.doInfo(asArgs[1])) break;
                /* falls through */
            default:
                dbg.println("unknown command: " + sCmd);
                break;
            }
        }
    };

    /**
     * C1PDebugger.init()
     *
     * This function operates on every HTML element of class "debugger", extracting the
     * JSON-encoded parameters for the C1PDebugger constructor from the element's "data-value"
     * attribute, invoking the constructor to create a C1PDebugger component, and then binding
     * any associated HTML controls to the new component.
     */
    C1PDebugger.init = function()
    {
        var aeDbg = Component.getElementsByClass(window.document, C1PJSCLASS, "debugger");
        for (var iDbg=0; iDbg < aeDbg.length; iDbg++) {
            var eDbg = aeDbg[iDbg];
            var parmsDbg = Component.getComponentParms(eDbg);
            var dbg = new C1PDebugger(parmsDbg);
            Component.bindComponentControls(dbg, eDbg, C1PJSCLASS);
        }
    };

    /*
     * Initialize every Debugger module on the page (as IF there's ever going to be more than one ;-))
     */
    web.onInit(C1PDebugger.init);

}   // endif DEBUGGER
