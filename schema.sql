-- 永倉管理系統 MySQL 資料庫建表指令 (Schema)

CREATE TABLE IF NOT EXISTS `Customers` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(100) NOT NULL,
    `Phone` VARCHAR(50) NOT NULL,
    `Category` VARCHAR(50) NOT NULL DEFAULT '個人',
    `LineId` VARCHAR(100) NULL,
    `Address` VARCHAR(200) NULL,
    `Email` VARCHAR(100) NULL,
    `Notes` LONGTEXT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    INDEX `IX_Customers_Name` (`Name`),
    INDEX `IX_Customers_Category` (`Category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `WorkLogs` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `CustomerId` INT NULL,
    `Title` VARCHAR(200) NOT NULL,
    `ScheduledAt` DATETIME(6) NOT NULL,
    `Status` VARCHAR(50) NOT NULL DEFAULT '待處理',
    `Details` LONGTEXT NULL,
    `Location` LONGTEXT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    INDEX `IX_WorkLogs_ScheduledAt` (`ScheduledAt`),
    CONSTRAINT `FK_WorkLogs_Customers_CustomerId` FOREIGN KEY (`CustomerId`) REFERENCES `Customers` (`Id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Quotations` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `QuotationNumber` VARCHAR(50) NOT NULL,
    `CustomerId` INT NOT NULL,
    `Title` VARCHAR(200) NOT NULL,
    `IssueDate` DATETIME(6) NOT NULL,
    `ExpiryDate` DATETIME(6) NULL,
    `TotalAmount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `Status` VARCHAR(50) NOT NULL DEFAULT '草稿',
    `Notes` LONGTEXT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    UNIQUE INDEX `IX_Quotations_QuotationNumber` (`QuotationNumber`),
    CONSTRAINT `FK_Quotations_Customers_CustomerId` FOREIGN KEY (`CustomerId`) REFERENCES `Customers` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `QuotationItems` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `QuotationId` INT NOT NULL,
    `ItemName` VARCHAR(200) NOT NULL,
    `Description` LONGTEXT NULL,
    `Quantity` DECIMAL(65,30) NOT NULL DEFAULT 1,
    `Unit` VARCHAR(20) NULL DEFAULT '式',
    `UnitPrice` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `Subtotal` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    PRIMARY KEY (`Id`),
    INDEX `IX_QuotationItems_QuotationId` (`QuotationId`),
    CONSTRAINT `FK_QuotationItems_Quotations_QuotationId` FOREIGN KEY (`QuotationId`) REFERENCES `Quotations` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Payments` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `CustomerId` INT NOT NULL,
    `QuotationId` INT NULL,
    `Title` VARCHAR(200) NOT NULL,
    `Amount` DECIMAL(18,2) NOT NULL DEFAULT 0.00,
    `PaymentDate` DATETIME(6) NOT NULL,
    `PaymentMethod` VARCHAR(50) NOT NULL DEFAULT '匯款',
    `Status` VARCHAR(50) NOT NULL DEFAULT '已收款',
    `InvoiceNumber` LONGTEXT NULL,
    `Notes` LONGTEXT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    INDEX `IX_Payments_PaymentDate` (`PaymentDate`),
    CONSTRAINT `FK_Payments_Customers_CustomerId` FOREIGN KEY (`CustomerId`) REFERENCES `Customers` (`Id`) ON DELETE CASCADE,
    CONSTRAINT `FK_Payments_Quotations_QuotationId` FOREIGN KEY (`QuotationId`) REFERENCES `Quotations` (`Id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
