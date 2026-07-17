const JC_EMAIL = PropertiesService.getScriptProperties.getProperty("JC_EMAIL") || "";
const GOOGLE_GROUP_EMAIL = PropertiesService.getScriptProperties.getProperty("GOOGLE_GROUP_EMAIL") || "";

const ALLOWED_TYPES = {
    ".pdf": ["application/pdf"],
    ".doc": ["application/msword"],
    ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ".odt": ["application/vnd.oasis.opendocument.text"],
    ".txt": ["text/plain"]
};

const ALLOWED_LINK_DOMAINS = [
    "drive.google.com",
    "docs.google.com"
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const DANGEROUS_PATTERN = /\.(exe|bat|cmd|sh|js|vbs|ps1|scr|jar|msi|com|dll|apk|html?)(\.|$)/i;

/**
 * 將西元日期轉換為民國紀年格式
 * @param {Date} date 日期
 * @returns {String} 民國紀年格式的日期
 */
function getROCDate(date) {
    const year = date.getFullYear() - 1911;
    return `中華民國 ${year} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/**
 * 屆次轉換
 * @param {Date} date Current date
 * @returns {String} Current reign
 */
function getReign(date) {
    /* @type {number} */
    let reign;
    if (date.getMonth() < 7) {
        // jan ~ july
        reign = date.getFullYear() - 1945 - 1;
    } else {
        reign = date.getFullYear() - 1945;
    }
    if (date.getMonth() > 6 || date.getMonth() == 0) {
        // aug ~ jan
        return `${reign}1`.padStart(4, "0");
    }
    return `${reign}2`.padStart(4, "0");
}

function getCurrentReign() {
    return getReign(new Date());
}

/**
 * 產生聲請編號
 * @param {string} applicationType "resolution" | "charter" | "lawsuit"
 * @returns {string} Case ID
 */
function generateCaseID(applicationType) {
    const PROP = PropertiesService.getScriptProperties();
    const REIGN = getCurrentReign();
    const SAVED_REIGN = PROP.getProperty("COUNTER_REIGN");

    let propertyName = null;

    switch (applicationType) {
        case "resolution":
            propertyName = "RESOLUTION_APPL_COUNTER";
            break;
        case "charter":
            propertyName = "CHARTER_APPL_COUNTER";
            break;
        case "lawsuit":
            propertyName = "LAWSUIT_APPL_COUNTER";
            break;
        default:
            throw new Error("Invalid application type");
    }

    let counter = parseInt(PROP.getProperty(propertyName) || 0, 10);

    if (REIGN !== SAVED_REIGN) {
        counter = 0;
        PROP.setProperty("COUNTER_REIGN", REIGN);
    }

    counter += 1;
    PROP.setProperty(propertyName, String(counter));

    return `${getApplicationTypeTranslation(applicationType)}聲請第${REIGN}${String(counter).padStart(3, "0")}號`;
}

/**
 * 取得聲請類型的中文翻譯
 * @param {string} applicationType "resolution" | "charter" | "lawsuit"
 * @returns {string} 中文申請類型
 */
function getApplicationTypeTranslation(applicationType) {
    switch (applicationType) {
        case "resolution":
            return "決議";
        case "charter":
            return "憲章訴訟";
        case "lawsuit":
            return "一般訴訟";
        default:
            throw new Error("Invalid application type");
    }
}

/**
 * 將純文字中的換行符號轉為 <br>，並先進行 HTML escape 以避免注入
 * @param {string} text 原始文字
 * @returns {string} 已 escape 且換行轉為 <br> 的 HTML 字串
 */
function nl2br(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/\r\n|\r|\n/g, "<br>");
}

function getDataUri(fileId) {
    Logger.log('fileId: %s', fileId);
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64Data = Utilities.base64Encode(blob.getBytes());
    const mimeType = blob.getContentType();
    return `data:${mimeType};base64,${base64Data}`;
}

function validateFile(fileName, mimeType, base64Data) {
    if (!fileName || !mimeType || !base64Data) {
        throw new Error("檔案資訊不完整");
    }

    // 1. 副檔名檢查
    const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_TYPES[ext]) {
        throw new Error(`不允許的檔案類型：${ext}`);
    }

    // 2. 雙重副檔名 / 危險字元檢查
    if (DANGEROUS_PATTERN.test(fileName) || /[\\/<>:"|?*\x00-\x1f]/.test(fileName)) {
        throw new Error("檔案名稱包含不允許的字元或副檔名");
    }

    // 3. 宣稱的 MIME type 是否對應副檔名
    if (!ALLOWED_TYPES[ext].includes(mimeType)) {
        throw new Error("檔案類型與副檔名不符");
    }

    // 4. 檔案大小檢查（base64 解碼後估算實際 bytes）
    const sizeBytes = Math.ceil(base64Data.length * 3 / 4);
    if (sizeBytes > MAX_FILE_SIZE) {
        throw new Error("檔案超過 10 MB 限制");
    }

    // 5. 實際內容的 MIME type 是否與宣稱一致（防止偽裝副檔名）
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    const actualType = blob.getContentType();
    if (actualType && !ALLOWED_TYPES[ext].includes(actualType)) {
        throw new Error("檔案內容與宣稱類型不符，可能為偽裝檔案");
    }

    return blob;
}

/**
 * 驗證分享連結（檔案或資料夾）是否可存取且已正確開放權限
 * @param {string} link 使用者提供的分享連結
 * @returns {string} 已驗證的連結
 */
function validateSharedLink(link) {
    if (!link || typeof link !== "string") {
        throw new Error("分享連結不得為空");
    }

    const trimmedLink = link.trim();

    // 1. 驗證是否為 https 開頭
    if (!/^https:\/\//i.test(trimmedLink)) {
        throw new Error("分享連結須為 https 開頭");
    }

    // 2. 擷取網域 (hostname) 並驗證
    const domainMatch = trimmedLink.match(/^https:\/\/([^/]+)/i);
    const hostname = domainMatch ? domainMatch[1].toLowerCase() : "";

    if (!ALLOWED_LINK_DOMAINS.includes(hostname)) {
        throw new Error("僅接受 Google 雲端硬碟分享連結");
    }

    // 3. 解析檔案或資料夾 ID
    const { type, item } = resolveDriveItemFromUrl(trimmedLink);

    // 4. 驗證 DriveApp 權限
    const access = item.getSharingAccess();
    const permission = item.getSharingPermission();

    if (access === DriveApp.Access.PRIVATE) {
        const label = type === "folder" ? "此資料夾" : "此連結";
        throw new Error(`${label}尚未開放共用，請設定為「知道連結的人皆可檢視」後再提交`);
    }

    if (permission !== DriveApp.Permission.VIEW && permission !== DriveApp.Permission.EDIT) {
        throw new Error("共用權限設定異常，請確認至少開放檢視權限");
    }

    // 5. 若為資料夾，額外檢查內容是否為空
    if (type === "folder") {
        const hasFiles = item.getFiles().hasNext();
        const hasSubfolders = item.getFolders().hasNext();
        if (!hasFiles && !hasSubfolders) {
            throw new Error("此資料夾內尚未放入任何檔案，請確認後再提交");
        }
    }

    return trimmedLink;
}

function saveFileToDrive(base64Data, fileName, mimeType) {
    const folder = DriveApp.getFolderById("16C7KiPFvJ5YTtEP0Gj-PNVshpZ74d2Rr");
    const blob = validateFile(fileName, mimeType, base64Data);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
}

/**
 * 將檔案移動到指定的案件資料夾
 * @param {string} fileUrl 舊檔案的雲端硬碟連結
 * @param {string} caseId 案件 ID
 * @returns {string} 案件資料夾的 URL
 */
function moveFileToCaseFolder(fileUrl, caseId) {
    const file = resolveDriveItemFromUrl(fileUrl).item;

    // Get parent folder
    const parentFolders = file.getParents();
    if (!parentFolders.hasNext()) {
        throw Error("找不到檔案的父資料夾");
    }
    const parentFolder = parentFolders.next();

    let caseFolder;
    const existingFolders = parentFolder.getFoldersByName(caseId);
    if (existingFolders.hasNext()) {
        caseFolder = existingFolders.next();
    } else {
        caseFolder = parentFolder.createFolder(caseId);
    }

    caseFolder.addFile(file);
    parentFolder.removeFile(file);

    return caseFolder.getUrl();
}

/**
 * 依照連結網址判斷是檔案或資料夾，並處理 resourcekey，回傳對應的 Drive 物件
 * @param {string} url 分享連結
 * @returns {{type: string, item: (File|Folder)}} type 為 "file" 或 "folder"
 */
function resolveDriveItemFromUrl(url) {
    // 1. 擷取資源金鑰 (resourcekey)
    const resourceKeyMatch = url.match(/[?&]resourcekey=([^&#]+)/);
    const resourceKey = resourceKeyMatch ? resourceKeyMatch[1] : null;

    // 2. 擷取 ID 與判斷類型
    // 資料夾格式：/drive/folders/{id} 或 /folderview?id={id}
    const folderMatch = url.match(/\/folders\/([-\w]{25,})/) || url.match(/[?&]id=([-\w]{25,})/);
    // 檔案格式：/file/d/{id}/
    const fileMatch = url.match(/\/file\/d\/([-\w]{25,})/);

    if (folderMatch && (url.includes("/folders/") || url.includes("folderview"))) {
        const folderId = folderMatch[1];
        try {
            const item = resourceKey
                ? DriveApp.getFolderByIdAndResourceKey(folderId, resourceKey)
                : DriveApp.getFolderById(folderId);
            return { type: "folder", item: item };
        } catch (e) {
            console.warn("Invalid folder URL:", url, e);
            throw new Error("無法存取此資料夾，請確認共用設定為「知道連結的人皆可檢視」");
        }
    }

    if (fileMatch) {
        const fileId = fileMatch[1];
        try {
            const item = resourceKey
                ? DriveApp.getFileByIdAndResourceKey(fileId, resourceKey)
                : DriveApp.getFileById(fileId);
            return { type: "file", item: item };
        } catch (e) {
            console.warn("Invalid file URL:", url, e);
            throw new Error("無法存取此檔案，請確認共用設定為「知道連結的人皆可檢視」");
        }
    }

    // 備援：嘗試從一般 25+ 字元 ID 中擷取（無法明確得知是檔案或資料夾時）
    const genericMatch = url.match(/[-\w]{25,}/);
    if (genericMatch) {
        const id = genericMatch[0];
        try {
            const item = resourceKey
                ? DriveApp.getFileByIdAndResourceKey(id, resourceKey)
                : DriveApp.getFileById(id);
            return { type: "file", item: item };
        } catch (e) {
            try {
                const item = resourceKey
                    ? DriveApp.getFolderByIdAndResourceKey(id, resourceKey)
                    : DriveApp.getFolderById(id);
                return { type: "folder", item: item };
            } catch (e2) {
                throw new Error("無法辨識此連結對應的檔案或資料夾");
            }
        }
    }

    throw new Error("無法從連結中解析檔案或資料夾 ID");
}

function sanitizeSpreadsheetInput(input) {
    if (typeof input !== "string") {
        return input;
    } else if (input.startsWith("=")) {
        return "'" + input;
    } else if (input.startsWith("+")) {
        return "'" + input;
    } else if (input.startsWith("-")) {
        return "'" + input;
    } else if (input.startsWith("@")) {
        return "'" + input;
    } else if (input.startsWith("\t")) {
        return "'" + input;
    } else if (input.startsWith("\r")) {
        return "'" + input;
    } else if (input.startsWith("\n")) {
        return "'" + input;
    } else if (input.startsWith("`")) {
        return "'" + input;
    }
    return input;
}

/**
 * 將新的聲請資料新增至 Google 試算表中
 * @param {string} applicationType 聲請類別（'resolution' | 'charter' | 'lawsuit'）
 * @param {string} subject 聲請標的
 * @param {string} detail 聲請人所持立場
 * @param {Applicant} applicant 聲請人
 * @param {string|null} application_link 聲請狀之雲端硬碟連結
 * @returns {string} caseId 案件號碼
 */
function insertNewRow(applicationType, subject, detail, applicant, application_link) {
    const SHEET = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("聲請收件表格");
    let caseId = generateCaseID(applicationType);
    const newRow = [
        caseId,
        new Date(),
        getApplicationTypeTranslation(applicationType),
        sanitizeSpreadsheetInput(subject),
        sanitizeSpreadsheetInput(detail),
        sanitizeSpreadsheetInput(applicant.jobTitle),
        sanitizeSpreadsheetInput(applicant.name),
        !!applicant.hideName,
        sanitizeSpreadsheetInput(applicant.classId),
        sanitizeSpreadsheetInput(applicant.studentId),
        sanitizeSpreadsheetInput(applicant.email),
        sanitizeSpreadsheetInput(application_link)
    ];

    const columnA = SHEET.getRange("A:A").getValues();
    let lastActualRow = 0;

    for (let i = columnA.length - 1; i >= 0; i--) {
        if (columnA[i][0] !== "") {
            lastActualRow = i + 1;
            break;
        }
    }

    SHEET.getRange(lastActualRow + 1, 1, 1, newRow.length).setValues([newRow]);

    return `${getApplicationTypeTranslation(applicationType)}線上聲請（${getCurrentReign()}）`;
}

/**
 * 寄送聲請通知郵件
 * @param {string} caseId 案件號碼
 * @param {string} applicationType 聲請類別（'resolution' | 'charter' | 'lawsuit'）
 * @param {string} subject 聲請標的
 * @param {string} detail 聲請人所持立場
 * @param {Applicant} applicant 聲請人
 * @param {string} applicationLink 聲請狀之雲端硬碟連結
 */
function sendNotificationEmail(caseId, applicationType, subject, detail, applicant, applicationLink) {
    const template = HtmlService.createTemplateFromFile("notificationEmailTemplate");

    template.caseId = caseId;
    template.subject = subject || null;
    template.detail = detail ? nl2br(detail) : null;
    template.jobTitle = applicant.jobTitle;
    template.applicantName = applicant.name;
    template.hideName = !!applicant.hideName;
    template.classId = applicant.classId;
    template.studentId = applicant.studentId;
    template.applicantEmail = applicant.email;
    template.applicationLink = applicationLink;
    template.todayStr = getROCDate(new Date());

    const emailBody = template.evaluate().getContent();
    const emailSubject = `【${getApplicationTypeTranslation(applicationType)}聲請】已收到${caseId}`;

    GmailApp.sendEmail(applicant.email, emailSubject, "", {
        htmlBody: emailBody,
        cc: JC_EMAIL,
        bcc: GOOGLE_GROUP_EMAIL,
        name: "臺北市立建國高級中學班聯會評議委員會線上聲請系統",
        noReply: true
    });
}