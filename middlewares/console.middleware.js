module.exports = {
    checkRequests: (req, res, next) => {
        console.log("Request received:", req.method, req.url);
        console.log("Request body:", req.body);
        console.log("Request headers:", req.headers);
        console.log("Request query:", req.query);
        next();
    },
    
};