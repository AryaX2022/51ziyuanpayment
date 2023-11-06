const express = require('express');
const app = express();
var bodyParser = require('body-parser')
// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false })
app.use(urlencodedParser);

// create application/json parser
var jsonParser = bodyParser.json()

const mysql = require('mysql');

var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
    service: 'qq',
    auth: {
        user: '6983299@qq.com',
        pass: process.env.MAIL_PWD
    }
});


const cors = require('cors');

app.use(cors());

// var con = mysql.createPool({
//     host: "localhost",
//     user: "root",
//     password: "123456",
//     database: "if0_34676683_share",
//     multipleStatements: true
// });
var con = mysql.createPool({
    host: "13.212.78.127",
    user: "web",
    password: process.env.ZIYUAN_DB_PWD,
    database: "ziyuan",
    multipleStatements: true
});
// con.connect(function(err) {
//     if (err) throw err;
// });


const AlipaySdk = require('alipay-sdk').default;
// TypeScript，可以使用 import AlipaySdk from 'alipay-sdk';
// 普通公钥模式
const alipaySdk = new AlipaySdk({
    appId: '2021004105625781',
    privateKey: process.env.ALI_PRV_KEY,
    alipayPublicKey: process.env.ALI_PBL_KEY,
});
const AlipayFormData = require('alipay-sdk/lib/form').default;

app.get("/", async function(request, response) {
    console.log("51ziyuan payment alive.");
    response.json("Live");
});

//用户申请vip：上传助力点赞截图
app.post('/userapplyvip', jsonParser, async function(request, response) {
    let username = request.body.username;
    con.query("insert into pre_applyvip(username,proof) values(?,?) on DUPLICATE KEY UPDATE proof = CONCAT( proof, ',', ?);", [username, request.body.proof, request.body.proof], function (err, result, fields) {
        if (err) {
            console.log(err);
        };

        //发送邮件：提醒管理员

        var mailOptions = {
            from: '6983299@qq.com',
            to: '6983299@qq.com',
            subject: username + '提交申请，请审批',
            html: '控制台: http://...ziyuanmnguserapply'
        };

        transporter.sendMail(mailOptions, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });


        response.json(result);
    });
});


//生成预订单、生成二维码
app.post('/createpayment', jsonParser, async function(request, response) {

    con.query("insert into pre_payment(username,amount,orderId, orderType) values(?,?,?,?);", [request.body.username, request.body.amount, request.body.out_trade_no, request.body.orderType], function (err, result, fields) {
        if (err) {
            console.log(err);
        };
    });

    const result = await alipaySdk.exec('alipay.trade.precreate', {
        notify_url: process.env.NT_CALLBACK_URL, // 通知回调地址
        bizContent: {
            out_trade_no: request.body.out_trade_no,
            total_amount: request.body.amount,
            subject: '51ziyuan.online'
        }
    });
    console.log(result);
    response.json(result.qrCode);

});


app.get('/h5payment',jsonParser, async function(request, response) {
    const formData = new AlipayFormData();
    formData.setMethod('get');
    formData.addField('bizContent', {
        outTradeNo: '1234567822112', // 订单号
        productCode: 'QUICK_WAP_WAY',
        totalAmount: '0.01',
        subject: 'biaoti标题',
        body: 'miaoshu描述',
    });
    console.log(formData)
    console.log(formData.fields[0].value)

    const result = alipaySdk.exec('alipay.trade.wap.pay', {}, {
        formData: formData
    }, { validateSign: true }).then(result => {
        console.log('支付宝返回支付链接：',result);
    });
    response.json({});
});


//轮询检查payment
app.post('/checkpayment', jsonParser, async function(request, response) {

    const outTradeNo = request.body.out_trade_no;

    const resultPay = await alipaySdk.exec('alipay.trade.query', {
        bizContent: {
            out_trade_no: outTradeNo,
        }
    });

    console.log(resultPay.tradeStatus);

    const flag= resultPay.tradeStatus === "TRADE_SUCCESS";

    if(flag) {

        con.query("update pre_common_member m inner join pre_payment p on m.username = p.username set m.actived=1, m.expired=(case p.orderType when 'D' then UNIX_TIMESTAMP()+86400 when 'M' then UNIX_TIMESTAMP()+2678400 when 'S' then UNIX_TIMESTAMP()+7776000 when 'Y' then UNIX_TIMESTAMP()+31536000  else UNIX_TIMESTAMP() end ), p.status='PAYED' where p.orderId=?", [outTradeNo], function (err, result, fields) {
            if (err) {
                console.log(err);
            };
        });

    }

    response.json(flag);

});

app.post('/paymentcallback', async function(request, response) {
    //console.log(request);
    console.log("pcallback");
    //console.log(request.body);
    if(request.body.trade_status === "TRADE_SUCCESS") {
        const outTradeNo = request.body.out_trade_no;
        //request.body.gmt_payment,
        //console.log(request.body);

        con.query("update pre_common_member m inner join pre_payment p on m.username = p.username set m.actived=1, m.expired=(case p.orderType when 'D' then UNIX_TIMESTAMP()+86400 when 'M' then UNIX_TIMESTAMP()+2678400 when 'S' then UNIX_TIMESTAMP()+7776000 when 'Y' then UNIX_TIMESTAMP()+31536000  else UNIX_TIMESTAMP() end ), p.status='PAYED' where p.orderId=?", [outTradeNo], function (err, result, fields) {
            if (err) {
                console.log(err);
            };
        });

    }
    response.json({});
});

//定时任务调用：每天执行一次，设置会员过期时间。
app.post('/setexpired', async function(request, response) {
    con.query("update pre_common_member set actived=0 where actived=1 and expired is not NULL and expired != 0  and UNIX_TIMESTAMP() > expired;", function (err, result, fields) {
        if (err) {
            console.log(err);
        };
        response.json(result);
    });
});

app.listen(process.env.PORT,() => console.log(('listening :)')))