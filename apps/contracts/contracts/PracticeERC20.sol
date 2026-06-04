// SPDX-License-Identifier: MIT
// SPDX：宣告原始碼授權條款（此處為 MIT），方便區塊鏈瀏覽器與工具辨識。

pragma solidity ^0.8.24;
// ^0.8.24：相容 0.8.24 以上、小於 0.9.0 的編譯器版本。
// 0.8.x 起內建算術溢出檢查，較不易因 uint 加減乘而靜默溢位。

// =============================================================================
// ERC-20 代幣標準（EIP-20）練習用實作
// =============================================================================
// 規範要點（鏈上「帳本」模型）：
//   - 每個 address 有一筆 balance（餘額）
//   - totalSupply 為所有餘額之和（本合約在 constructor 鑄造後不再變動，除非你自行加 mint）
//   - transfer：持有人把代幣轉給他人
//   - approve + transferFrom：持有人授權「代理人」spender 代為轉出（常用於 DEX、質押合約）
//   - 必須發出 Transfer、Approval 事件，方便錢包與索引器追蹤
//
// 本檔「刻意」不繼承 OpenZeppelin，方便對照每一行與 EIP 的對應關係。
// 實務專案建議使用經審計的函式庫，並補齊 permit（EIP-2612）等擴充。
// =============================================================================

/// @title 練習用 ERC20 代幣（PracticeERC20）
/// @notice 示範 EIP-20 必要介面、事件、餘額 mapping、授權 allowance 與 transferFrom。
/// @dev 部署時將 initialSupply 鑄造給 deployer；decimals 僅供鏈下顯示，鏈上仍以最小單位（wei 類比）計數。
contract PracticeERC20 {
    // contract：宣告智慧合約；大括號內為合約本體。

    // --- 自訂錯誤（Custom Errors）：比字串 require 省 gas，且利於鏈下解碼 ---

    /// @dev 轉帳／授權的目標或來源為零位址（無效位址）。
    error ZeroAddress();
    /// @dev 餘額不足以完成 transfer 或 transferFrom。
    error InsufficientBalance();
    /// @dev transferFrom 時 allowance 不足。
    error InsufficientAllowance();
    /// @dev 鑄造或轉出數量為 0（本合約選擇拒絕，非 EIP 強制，屬教學用嚴格檢查）。
    error ZeroAmount();

    // --- EIP-20 規定的事件 ---

    /// @dev 代幣從 from 轉至 to；鑄造時 from = address(0)，銷毀時 to = address(0)（本合約未實作 burn）。
    /// @param from 轉出方；indexed 方便鏈下依「誰轉出」篩選。
    /// @param to 轉入方。
    /// @param value 數量（最小單位，非「人類可讀」的小數位；小數由 decimals 在鏈下換算）。
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @dev owner 授權 spender 可代為動用最多 value 顆代幣（透過 transferFrom）。
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // --- 代幣元資料（EIP-20 建議欄位；錢包顯示名稱／符號／小數位）---

    /// @notice 代幣全名，例如 "Practice Token"。
    string public name;
    // string：動態字串，存在 storage；public 會產生 name() getter。

    /// @notice 代幣符號，例如 "PRC"。
    string public symbol;

    /// @notice 小數位數；例如 18 表示 1 顆代幣 = 10^18 個最小單位（類似 ETH 的 wei）。
    /// @dev EIP-20 要求回傳 uint8；鏈上運算仍用整數最小單位，decimals 不參與 transfer 數學。
    uint8 public decimals;

    /// @notice 流通總量（最小單位）；public 產生 totalSupply() getter。
    uint256 public totalSupply;

    // --- 核心帳本：address => balance ---

    /// @notice 各地址持有的代幣餘額（最小單位）。
    mapping(address => uint256) public balanceOf;
    // mapping：雜湊表；key 為 address，value 為 uint256。
    // public mapping 會產生 balanceOf(address) 回傳 uint256。

    /// @notice 授權額度：owner 允許 spender 代為轉出的剩餘額度。
    /// @dev 結構為 owner => spender => amount；transferFrom 成功後會扣減此值。
    mapping(address => mapping(address => uint256)) public allowance;
    // 巢狀 mapping：先查 owner，再查 spender。

    // --- 建構子：部署時鑄造初始供給 ---

    /// @param tokenName 代幣名稱。
    /// @param tokenSymbol 代幣符號。
    /// @param tokenDecimals 小數位（常見 18）。
    /// @param initialSupply 初始流通量，以「整顆代幣」計（非最小單位）；會乘上 10**decimals 再入帳。
    /// @dev 鑄造給 msg.sender（部署者）。若要以「最小單位」傳入，可改參數語意並刪除下方乘法。
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint8 tokenDecimals,
        uint256 initialSupply
    ) {
        // memory：建構子參數中的 string 在呼叫端 calldata／memory，此處複製語意依編譯器優化。
        if (initialSupply == 0) revert ZeroAmount();

        name = tokenName;
        symbol = tokenSymbol;
        decimals = tokenDecimals;

        // 將「人類單位」換成鏈上最小單位：例如 1000 顆、18 decimals → 1000 * 10^18
        uint256 supply = initialSupply * (10 ** uint256(tokenDecimals));
        // 10 ** uint256(tokenDecimals)：編譯期／執行期次方；tokenDecimals 最大 255，注意極端值 gas。

        totalSupply = supply;
        balanceOf[msg.sender] = supply;

        // 鑄造：from 為零位址，表示「憑空增加」流通量（慣例，非 EIP 強制欄位名）
        emit Transfer(address(0), msg.sender, supply);
    }

    // =========================================================================
    // EIP-20 必要函式
    // =========================================================================

    /// @notice 將呼叫者 msg.sender 的代幣轉給 to。
    /// @param to 收款地址，不可為 address(0)（本合約拒絕，避免誤燒到零位址）。
    /// @param amount 轉帳數量（最小單位）。
    /// @return success EIP-20 要求回傳 bool；失敗應 revert（本合約用 revert，成功恆 true）。
    function transfer(address to, uint256 amount) external returns (bool) {
        // external：由外部帳戶／合約直接呼叫。
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice 授權 spender 可從 msg.sender 帳戶代為轉出最多 amount（可覆寫為新額度）。
    /// @param spender 被授權的代理人合約或地址。
    /// @param amount 授權上限（最小單位）；設為 0 可視為撤銷（慣例）。
    /// @return success 成功時 true。
    /// @dev 注意：部分舊代幣需先 approve(0) 再改額度以防 front-running；本練習合約直接覆寫 allowance。
    function approve(address spender, uint256 amount) external returns (bool) {
        if (spender == address(0)) revert ZeroAddress();

        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice 從 from 轉 amount 到 to；呼叫者須為 from 本人，或已被 from approve 足夠額度。
    /// @param from 轉出方。
    /// @param to 轉入方。
    /// @param amount 數量（最小單位）。
    /// @return success 成功時 true。
    /// @dev 典型流程：使用者 approve(DEX, x) → DEX 呼叫 transferFrom(使用者, 池子, x)。
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // 若呼叫者不是 from，必須消耗 allowance（from 本人呼叫時可跳過扣 allowance，屬常見優化）
        if (msg.sender != from) {
            uint256 allowed = allowance[from][msg.sender];
            if (allowed < amount) revert InsufficientAllowance();
            // 先扣授權額度（Effect），再改餘額（_transfer 內）
            unchecked {
                allowance[from][msg.sender] = allowed - amount;
            }
        }

        _transfer(from, to, amount);
        return true;
    }

    // =========================================================================
    // 內部邏輯：共用轉帳，避免 transfer 與 transferFrom 重複程式碼
    // =========================================================================

    /// @dev 實際搬移 balance 並發出 Transfer；不檢查 allowance（由 transferFrom 處理）。
    function _transfer(address from, address to, uint256 amount) private {
        // private：僅本合約內部可呼叫。
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance();

        unchecked {
            // fromBalance >= amount 時減法不溢出
            balanceOf[from] = fromBalance - amount;
            balanceOf[to] += amount;
        }

        emit Transfer(from, to, amount);
    }

    // =========================================================================
    // 選讀：EIP-20 與介面、擴充的對照（註解說明，非本合約程式碼）
    // =========================================================================
    //
    // 標準介面（若拆成 IERC20.sol，其他合約可 import 並依型別互動）：
    //
    //   interface IERC20 {
    //       function totalSupply() external view returns (uint256);
    //       function balanceOf(address account) external view returns (uint256);
    //       function transfer(address to, uint256 amount) external returns (bool);
    //       function allowance(address owner, address spender) external view returns (uint256);
    //       function approve(address spender, uint256 amount) external returns (bool);
    //       function transferFrom(address from, address to, uint256 amount) external returns (bool);
    //       event Transfer(address indexed from, address indexed to, uint256 value);
    //       event Approval(address indexed owner, address indexed spender, uint256 value);
    //   }
    //
    // 常見擴充（本練習合約未實作）：
    //   - increaseAllowance / decreaseAllowance：避免 approve 直接改大額的 front-run 風險
    //   - mint / burn：動態調整 totalSupply
    //   - EIP-2612 permit：用簽章代替一筆 approve 交易，省 gas
    //
    // 安全提醒（練習後可進一步閱讀）：
    //   - 勿對不信任的合約無限 approve
    //   - transferFrom 應先改狀態再對外呼叫（本函式無外部 call，已符合 CEI 精神）
    //   - 代幣小數僅影響 UI；合約內一律用最小單位整數
    // =========================================================================
}
