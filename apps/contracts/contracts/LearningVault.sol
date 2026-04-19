// SPDX-License-Identifier: MIT
// SPDX：Software Package Data Exchange 的縮寫；這一行宣告「授權條款識別字」，讓區塊鏈瀏覽器與工具知道此原始碼採用的授權（此處為 MIT）。

pragma solidity ^0.8.24;
// pragma：編譯器指示詞（directive），告訴 Solidity 編譯器如何處理此檔案。
// solidity：語言名稱。
// ^0.8.24：版本區間。^ 表示「相容 0.8.24 以上、但小於 0.9.0」的次版/修正版（語意版本規則）。

/// @title 教學用簡易金庫（LearningVault）
/// @notice 示範：狀態變數、事件、自訂錯誤、modifier、payable、receive、Checks-Effects-Interactions、簡單重入鎖。
/// @dev 建議閱讀順序：1) 自訂錯誤與事件 2) 狀態變數 3) modifier 4) constructor 5) receive 6) deposit／withdraw 7) 管理／緊急函式。
contract LearningVault {
    // contract：關鍵字，宣告一個「智慧合約」型別；大括號內為合約本體。

    // --- 自訂錯誤（Custom Errors）---
    // error：宣告可在 revert 時使用的「具名錯誤型別」。相較舊式字串 require，通常更省 gas、也更利於鏈下解碼。
    /// @dev 呼叫者不是 owner 時使用。
    error NotOwner();
    /// @dev 傳入零位址（address(0)）時使用；零位址常代表「無效／未設定」。
    error ZeroAddress();
    /// @dev 合約已暫停（paused == true）卻嘗試執行需運作的函式時使用。
    /// （名稱不可與下方 event Paused 相同：error 與 event 共用同一命名空間。）
    error VaultIsPaused();
    /// @dev 合約未暫停卻呼叫僅能在暫停狀態下執行的函式時使用。
    error VaultIsNotPaused();
    /// @dev 提款金額為 0。
    error ZeroAmount();
    /// @dev 使用者餘額不足。
    error InsufficientBalance();
    /// @dev 底層 ETH 轉帳失敗（對方拒收或 gas 不足等）。
    error TransferFailed();
    /// @dev 偵測到重入（reentrancy）：在外部呼叫完成前又進入受保護函式。
    error ReentrantCall();

    // --- 事件（Events）---
    // event：宣告鏈上「日誌」的 schema。鏈下（索引器、前端）可訂閱這些 topic／data。
    // indexed：最多三個欄位可加 indexed；可加索引欄位讓鏈下更容易篩選（topic）。未 indexed 的欄位放在 log data。
    /// @dev 擁有權轉移。
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    /// @dev 合約被暫停。
    event Paused(address indexed account);
    /// @dev 合約恢復運作。
    event Unpaused(address indexed account);
    /// @dev 入金成功。
    event Deposit(address indexed user, uint256 amount, uint256 newBalance);
    /// @dev 出金成功。
    event Withdraw(address indexed user, uint256 amount, uint256 newBalance);
    /// @dev 緊急出金：將合約內全部 ETH 轉給 owner（僅教學示範風險）。
    event EmergencyWithdraw(address indexed owner, uint256 amount);

    // --- 狀態變數（State variables）：寫入區塊鏈儲存，讀寫成本較高（相對 memory／calldata）---

    /// @notice 擁有者位址；public 會自動產生同名 getter 函式 owner()。
    address public owner;
    // address：160 位元的以太坊帳戶／合約位址型別。
    // public：可見性；外部可呼叫自動生成的 getter 讀取此變數。

    /// @notice 是否暫停；true 時阻擋一般入出金。
    bool public paused;
    // bool：布林型別，僅 true／false。

    /// @notice 重入鎖；true 表示某個受 nonReentrant 保護的函式正在執行中。
    bool private locked;
    // private：僅合約內部可存取；外部無法讀取（沒有自動 getter）。

    /// @notice 每位使用者在「帳本」上的 ETH 餘額（以 wei 為單位）。
    mapping(address => uint256) public balances;
    // mapping(keyType => valueType)：雜湊表結構；key 幾乎任意型別（此處 address），value 為 uint256。
    // uint256：256 位元無號整數；金額常用 wei（1 ETH = 1e18 wei）。
    // public mapping 會產生 getter(address) 回傳 uint256。

    // --- Modifier：修飾子；在函式本體前後插入「樣板」邏輯，_; 代表被修飾函式本體的插入點 ---

    /// @dev 僅允許 owner 呼叫；見上文「owner」狀態變數。
    modifier onlyOwner() {
        // modifier：關鍵字。
        if (msg.sender != owner) revert NotOwner();
        // msg：內建特殊變數；msg.sender 為「直接呼叫此函式的帳戶」（可能是 EOA 或合約）。
        // if：條件式。
        // !=：不等於。
        // revert NotOwner()：中止交易並回傳自訂錯誤（不建立字串）。
        _; // 底線：接續執行「被修飾函式」本體。
    }

    /// @dev 僅在未暫停時可執行。
    modifier whenNotPaused() {
        if (paused) revert VaultIsPaused();
        _;
    }

    /// @dev 僅在已暫停時可執行（例如 unpause、緊急函式）。
    modifier whenPaused() {
        if (!paused) revert VaultIsNotPaused();
        // !：邏輯 NOT。
        _;
    }

    /// @dev 防止重入：同一交易內不可巢狀進入第二層受保護呼叫。
    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true; // Effect：先上鎖（屬於「先改狀態」的一環，搭配 CEI 講解）。
        _;
        locked = false; // 函式結束前解鎖（在內聯的函式本體執行完之後）。
    }

    // --- 建構子（constructor）：部署合約時「僅執行一次」 ---

    /// @param initialOwner 初始擁有者；若傳 address(0) 則預設為部署者 msg.sender。
    constructor(address initialOwner) {
        // constructor：關鍵字；無回傳型別；部署時由 EVM 執行。
        address o = initialOwner == address(0) ? msg.sender : initialOwner;
        // address(0)：將 0 轉型為 address，代表零位址。
        // ==：相等比較。
        // ? :：三元運算子；條件為真取左值，否則取右值。
        if (o == address(0)) revert ZeroAddress(); // 雙重保險（理論上 o 已非零）。
        owner = o;
        emit OwnershipTransferred(address(0), o);
        // emit：觸發事件，寫入交易 receipt 的 logs。
    }

    // --- ETH 接收：receive 與 fallback（概念註解）---
    // receive：當呼叫帶入空 calldata 且帶有 ETH（msg.value > 0）時，若存在 payable receive，會被優先匹配。
    // fallback：無 receive 或 calldata 不符合任何函式選擇器時可能走到 fallback（此檔未示範 fallback，避免初學混淆）。

    /// @notice 直接轉入 ETH 時會走到此函式，內部轉呼叫 deposit。
    receive() external payable {
        // external：僅能從合約「外部」呼叫（或透過 .call 等）；介面較省 gas。
        // payable：允許此函式接收 ETH（msg.value 可大於 0）。
        deposit(); // 委派到公開 deposit，以共用檢查與事件邏輯。
    }

    // --- 對外業務函式 ---

    /// @notice 存入 ETH；需合約未暫停。
    /// @dev msg.value 為此筆交易附帶的 wei 數量。
    function deposit() public payable whenNotPaused {
        // public：外部與內部皆可呼叫；相對 external，內部若以 this.deposit() 會多一次 external call（此處未使用）。
        // payable：同上；deposit 必須 payable 才能接收 msg.value。
        uint256 amount = msg.value;
        // uint256：區域變數型別；區域變數預設存在 stack（簡化理解），非 storage。
        if (amount == 0) revert ZeroAmount();

        // Effect：先更新帳本（符合 CEI 的 Effect 在 Interaction 之前）。
        uint256 newBalance = balances[msg.sender] + amount;
        balances[msg.sender] = newBalance;

        emit Deposit(msg.sender, amount, newBalance);
        // Interaction：此函式沒有對外轉帳，故無外部呼叫步驟；deposit 的「互動」僅是接收已附帶的 value。
    }

    /// @notice 提領自己帳本中的 ETH 到 msg.sender。
    /// @param amount 欲提領的 wei 數量。
    /// @dev 示範 Checks-Effects-Interactions（CEI）與 nonReentrant。
    function withdraw(uint256 amount) external whenNotPaused nonReentrant {
        // external：由使用者直接呼叫較常見；參數若為動態型別會存在 calldata（此處 amount 為值型別 uint256，存在 calldata／stack 視情境）。

        // --- Check：驗證輸入與前置條件 ---
        if (amount == 0) revert ZeroAmount();
        uint256 bal = balances[msg.sender];
        if (bal < amount) revert InsufficientBalance();
        // <：小於比較。

        // --- Effect：先改合約狀態，降低重入攻擊風險 ---
        unchecked {
            // unchecked：關閉算術溢出檢查以省 gas；僅在數學可證明不溢出時使用。
            // 此處 bal >= amount，故 bal - amount 不溢出。
            balances[msg.sender] = bal - amount;
        }

        // --- Interaction：對外呼叫（可能把控制權交給惡意合約）應放最後 ---
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        // payable(address)：將 address 轉成可支付 ETH 的位址型別。
        // .call{value: amount}("")：低階呼叫，附帶 amount wei；回傳 (bool success, bytes memory data)。
        // 此處忽略 data，僅檢查 ok。
        if (!ok) revert TransferFailed();

        emit Withdraw(msg.sender, amount, balances[msg.sender]);
    }

    /// @notice 唯讀查詢某位使用者的帳本餘額。
    /// @param user 要查詢的位址。
    /// @return 該位址的餘額（wei）。
    function balanceOf(address user) external view returns (uint256) {
        // view：承諾不修改狀態；可讀取狀態變數。
        // returns (uint256)：回傳型別宣告。
        return balances[user];
        // return：將值回傳給呼叫端。
    }

    /// @notice 合約持有的實際 ETH（鏈上 balance），教學用對照「帳本總和」概念。
    /// @return 合約地址上的 wei 餘額。
    function totalEthHeld() external view returns (uint256) {
        return address(this).balance;
        // this：目前合約實例；address(this) 轉成 address；.balance 為該位址的 ETH 餘額。
    }

    // --- 管理：暫停／恢復／轉移擁有權 ---

    /// @notice 暫停合約；僅 owner。
    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice 恢復合約；僅 owner。
    function unpause() external onlyOwner whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice 轉移 owner；僅目前 owner 可呼叫。
    /// @param newOwner 新擁有者，不可為零位址。
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }

    /// @notice 緊急出金：僅 owner、且必須已暫停；把合約內全部 ETH 轉給 owner。
    /// @dev 教學用：不會逐筆沖銷 balances，實務上需配套會計／遷移流程；此處用註解強調風險。
    function emergencyWithdraw() external onlyOwner whenPaused nonReentrant {
        uint256 amount = address(this).balance;
        if (amount == 0) revert ZeroAmount();

        (bool ok, ) = payable(owner).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit EmergencyWithdraw(owner, amount);
    }
}
